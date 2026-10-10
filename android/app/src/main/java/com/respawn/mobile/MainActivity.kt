package com.respawn.mobile

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.Bundle
import android.view.View
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import io.livekit.android.LiveKit
import io.livekit.android.events.RoomEvent
import io.livekit.android.events.collect
import io.livekit.android.room.Room
import io.livekit.android.room.track.screencapture.ScreenCaptureParams
import io.livekit.android.room.track.DataPublishReliability
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException

private data class GameOption(val id: String, val title: String) {
    override fun toString() = title
}

class MainActivity : ComponentActivity() {
    private val http = OkHttpClient()
    private val jsonType = "application/json; charset=utf-8".toMediaType()
    private var accessToken: String? = null
    private var userId: String? = null
    private var room: Room? = null
    private var streamId: String? = null
    private var games: List<GameOption> = emptyList()

    private lateinit var emailInput: EditText
    private lateinit var passwordInput: EditText
    private lateinit var titleInput: EditText
    private lateinit var gameSpinner: Spinner
    private lateinit var loginButton: Button
    private lateinit var goLiveButton: Button
    private lateinit var stopButton: Button
    private lateinit var statusLabel: TextView
    private lateinit var chatLog: TextView
    private lateinit var chatInput: EditText
    private lateinit var chatSendButton: Button
    private lateinit var hostPanel: LinearLayout
    private var chatCollector: Job? = null

    private val capturePermissions = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { grants ->
        val notificationsRequired = android.os.Build.VERSION.SDK_INT < 33 || grants[Manifest.permission.POST_NOTIFICATIONS] == true || ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == android.content.pm.PackageManager.PERMISSION_GRANTED
        if (!notificationsRequired) showStatus("Allow notifications so Android can show the active screen-sharing notification.")
        else launchScreenPermission()
    }
    private val screenPermission = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val projectionData = result.data
        if (result.resultCode != Activity.RESULT_OK || projectionData == null) {
            showStatus("Screen capture was cancelled.")
            return@registerForActivityResult
        }
        lifecycleScope.launch { startLive(projectionData) }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        buildInterface()
        if (BuildConfig.SUPABASE_URL.isBlank() || BuildConfig.SUPABASE_ANON_KEY.isBlank()) {
            showStatus("Configure SUPABASE_URL and SUPABASE_ANON_KEY in android/local.properties, then rebuild.")
        } else {
            setSignedIn(false)
        }
    }

    private fun buildInterface() {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(22), dp(26), dp(22), dp(22))
            setBackgroundColor(0xFF090B0A.toInt())
        }
        val scroll = ScrollView(this).apply { addView(root) }
        setContentView(scroll)

        root.addView(TextView(this).apply {
            text = "RESPAWN LIVE"
            textSize = 12f
            letterSpacing = .18f
            setTextColor(0xFFB6F36A.toInt())
        })
        root.addView(TextView(this).apply {
            text = "Broadcast your game screen"
            textSize = 26f
            setTextColor(0xFFF3F5F1.toInt())
            setPadding(0, dp(8), 0, dp(4))
        })
        root.addView(TextView(this).apply {
            text = "Sign in with your RESPAWN account, choose a game, then approve Android's screen-capture prompt. The capture continues while you switch to your game."
            textSize = 14f
            setTextColor(0xFFAEB6AC.toInt())
        })

        emailInput = editText("Email address", "textEmailAddress")
        passwordInput = editText("Password", "textPassword")
        loginButton = button("Sign in") { signIn() }
        root.addView(emailInput); root.addView(passwordInput); root.addView(loginButton)

        hostPanel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            visibility = View.GONE
            setPadding(0, dp(18), 0, 0)
        }
        gameSpinner = Spinner(this)
        titleInput = editText("Stream title", "text")
        goLiveButton = button("Go Live — capture screen") { requestCapturePermissions() }
        stopButton = button("Stop stream") { lifecycleScope.launch { stopLive() } }
        stopButton.visibility = View.GONE
        chatLog = TextView(this).apply {
            text = "Live chat\n"
            textSize = 13f
            setTextColor(0xFFD7DED4.toInt())
            setPadding(0, dp(12), 0, dp(8))
        }
        chatInput = editText("Message everyone watching…", "text")
        chatSendButton = button("Send chat") { lifecycleScope.launch { sendChat() } }
        chatInput.visibility = View.GONE
        chatSendButton.visibility = View.GONE
        statusLabel = TextView(this).apply {
            textSize = 14f
            setTextColor(0xFFD7DED4.toInt())
            setPadding(0, dp(12), 0, dp(12))
        }
        hostPanel.addView(gameSpinner); hostPanel.addView(titleInput)
        hostPanel.addView(goLiveButton); hostPanel.addView(stopButton)
        hostPanel.addView(chatLog); hostPanel.addView(chatInput); hostPanel.addView(chatSendButton); hostPanel.addView(statusLabel)
        root.addView(hostPanel)
    }

    private fun editText(hintText: String, inputTypeName: String) = EditText(this).apply {
        hint = hintText
        textSize = 15f
        setSingleLine(true)
        setPadding(dp(12), dp(10), dp(12), dp(10))
        inputType = when (inputTypeName) {
            "textEmailAddress" -> android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
            "textPassword" -> android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD
            else -> android.text.InputType.TYPE_CLASS_TEXT
        }
    }

    private fun button(label: String, action: () -> Unit) = Button(this).apply {
        text = label
        isAllCaps = false
        setOnClickListener { action() }
    }

    private fun setSignedIn(signedIn: Boolean) {
        emailInput.visibility = if (signedIn) View.GONE else View.VISIBLE
        passwordInput.visibility = if (signedIn) View.GONE else View.VISIBLE
        loginButton.visibility = if (signedIn) View.GONE else View.VISIBLE
        hostPanel.visibility = if (signedIn) View.VISIBLE else View.GONE
    }

    private fun showStatus(message: String) {
        if (::statusLabel.isInitialized) statusLabel.text = message
        else Toast.makeText(this, message, Toast.LENGTH_LONG).show()
    }

    private fun signIn() {
        val email = emailInput.text.toString().trim()
        val password = passwordInput.text.toString()
        if (email.isBlank() || password.isBlank()) { showStatus("Enter your RESPAWN email and password."); return }
        loginButton.isEnabled = false
        showStatus("Signing in…")
        lifecycleScope.launch {
            try {
                val response = apiRequest(
                    method = "POST",
                    path = "/auth/v1/token?grant_type=password",
                    body = JSONObject().put("email", email).put("password", password),
                    bearer = null,
                )
                accessToken = response.getString("access_token")
                userId = response.getJSONObject("user").getString("id")
                setSignedIn(true)
                loadGames()
                showStatus("Signed in. Your game screen is shared only after you approve Android's capture prompt.")
            } catch (error: Exception) {
                showStatus("Sign in failed: ${error.message ?: "check your email and password"}")
            } finally { loginButton.isEnabled = true }
        }
    }

    private suspend fun loadGames() {
        val response = apiRequest(
            method = "GET",
            path = "/rest/v1/games?select=id,title&is_published=eq.true&order=title.asc",
            bearer = accessToken,
        )
        val rows = response.getJSONArray("data")
        games = (0 until rows.length()).map { index ->
            val row = rows.getJSONObject(index); GameOption(row.getString("id"), row.getString("title"))
        }
        withContext(Dispatchers.Main) {
            gameSpinner.adapter = ArrayAdapter(this@MainActivity, android.R.layout.simple_spinner_dropdown_item, games)
            if (games.isEmpty()) showStatus("No published games were found. Check that the catalog is seeded.")
        }
    }

    private fun requestCapturePermissions() {
        if (games.isEmpty()) { showStatus("Wait for the game catalog to load."); return }
        val permissions = buildList {
            if (android.os.Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) add(Manifest.permission.POST_NOTIFICATIONS)
        }
        if (permissions.isNotEmpty()) capturePermissions.launch(permissions.toTypedArray()) else launchScreenPermission()
    }

    private fun launchScreenPermission() {
        val manager = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        showStatus("Approve the Android screen-capture prompt. Then switch to your game; capture stays active until you press Stop.")
        screenPermission.launch(manager.createScreenCaptureIntent())
    }

    private suspend fun startLive(projectionData: Intent) {
        val token = accessToken ?: run { showStatus("Please sign in again."); return }
        val game = games.getOrNull(gameSpinner.selectedItemPosition) ?: run { showStatus("Choose a game."); return }
        val streamTitle = titleInput.text.toString().trim().ifBlank { "${game.title} live" }
        goLiveButton.isEnabled = false
        showStatus("Creating your RESPAWN live listing…")
        try {
            val created = apiRequest(
                method = "POST",
                path = "/rest/v1/live_streams",
                body = JSONObject().put("host_id", userId).put("game_id", game.id).put("title", streamTitle),
                bearer = token,
                preferRepresentation = true,
            )
            val createdStreamId = created.getJSONArray("data").getJSONObject(0).getString("id")
            streamId = createdStreamId
            val tokenResponse = apiRequest(
                method = "POST",
                path = "/functions/v1/livekit-token",
                body = JSONObject().put("stream_id", createdStreamId).put("role", "host"),
                bearer = token,
            )
            val liveRoom = withContext(Dispatchers.Main) {
                LiveKit.create(applicationContext).also { room = it }
            }
            val wsUrl = tokenResponse.getString("url")
            val participantToken = tokenResponse.getString("token")
            withContext(Dispatchers.Main) { showStatus("Connecting to LiveKit…") }
            liveRoom.connect(wsUrl, participantToken)
            liveRoom.localParticipant.setScreenShareEnabled(true, ScreenCaptureParams(projectionData))
            chatCollector?.cancel()
            chatCollector = lifecycleScope.launch {
                liveRoom.events.collect { event ->
                    if (event is RoomEvent.DataReceived && event.topic == "respawn-live-chat") {
                        val message = runCatching { JSONObject(event.data.toString(Charsets.UTF_8)) }.getOrNull() ?: return@collect
                        val text = message.optString("text").trim()
                        if (text.isNotEmpty()) appendChat("${event.participant?.name ?: "Player"}: $text")
                    }
                }
            }
            streamIdActive = createdStreamId
            withContext(Dispatchers.Main) {
                stopButton.visibility = View.VISIBLE
                chatInput.visibility = View.VISIBLE
                chatSendButton.visibility = View.VISIBLE
                goLiveButton.text = "LIVE — switch to your game"
                showStatus("You're live on ${game.title}. Switch to your game; return here and press Stop stream when finished.")
                Toast.makeText(this@MainActivity, "RESPAWN is live", Toast.LENGTH_LONG).show()
            }
        } catch (error: Exception) {
            chatCollector?.cancel(); chatCollector = null
            room?.let { failedRoom -> runCatching { failedRoom.disconnect() }; runCatching { failedRoom.release() } }
            room = null
            streamId?.let { id -> runCatching { apiRequest("DELETE", "/rest/v1/live_streams?id=eq.$id", null, accessToken) } }
            streamIdActive = null
            streamId = null
            withContext(Dispatchers.Main) {
                showStatus("Could not start stream: ${error.message ?: "check connection and Supabase setup"}")
                goLiveButton.isEnabled = true
            }
        }
    }

    private var streamIdActive: String? = null

    private suspend fun sendChat() {
        val message = chatInput.text.toString().trim().take(500)
        val currentRoom = room ?: return
        if (message.isEmpty()) return
        val payload = JSONObject().put("text", message).put("sentAt", System.currentTimeMillis()).toString().toByteArray(Charsets.UTF_8)
        val result = currentRoom.localParticipant.publishData(
            data = payload,
            reliability = DataPublishReliability.RELIABLE,
            topic = "respawn-live-chat",
        )
        if (result.isSuccess) {
            appendChat("You: $message")
            withContext(Dispatchers.Main) { chatInput.text.clear() }
        } else {
            showStatus("Chat send failed: ${result.exceptionOrNull()?.message ?: "LiveKit data send failed"}")
        }
    }

    private fun appendChat(message: String) {
        runOnUiThread {
            val current = chatLog.text.toString().lines().filter { it.isNotBlank() }.takeLast(40)
            chatLog.text = (current + message).joinToString("\n")
        }
    }

    private suspend fun stopLive() {
        goLiveButton.isEnabled = false
        try {
            chatCollector?.cancel(); chatCollector = null
            room?.localParticipant?.setScreenShareEnabled(false)
            room?.disconnect()
            room?.release()
            room = null
            streamIdActive?.let { id ->
                apiRequest("DELETE", "/rest/v1/live_streams?id=eq.$id", null, accessToken)
            }
            streamIdActive = null
            withContext(Dispatchers.Main) {
                stopButton.visibility = View.GONE
                chatInput.visibility = View.GONE
                chatSendButton.visibility = View.GONE
                goLiveButton.text = "Go Live — capture screen"
                showStatus("Stream stopped.")
            }
        } catch (error: Exception) {
            showStatus("Stream stopped locally; cleanup warning: ${error.message}")
        } finally { goLiveButton.isEnabled = true }
    }

    private suspend fun apiRequest(
        method: String,
        path: String,
        body: JSONObject?,
        bearer: String?,
        preferRepresentation: Boolean = false,
    ): JSONObject = withContext(Dispatchers.IO) {
        val baseUrl = BuildConfig.SUPABASE_URL.trimEnd('/')
        val anonKey = BuildConfig.SUPABASE_ANON_KEY
        if (baseUrl.isBlank() || anonKey.isBlank()) throw IOException("Android Supabase settings are missing.")
        val builder = Request.Builder().url("$baseUrl$path").header("apikey", anonKey)
        builder.header("Authorization", "Bearer ${bearer ?: anonKey}")
        if (preferRepresentation) builder.header("Prefer", "return=representation")
        if (body != null) builder.header("Content-Type", "application/json")
        val requestBody = body?.toString()?.toRequestBody(jsonType)
        val request = when (method) {
            "GET" -> builder.get().build()
            "DELETE" -> builder.delete().build()
            else -> builder.method(method, requestBody ?: "{}".toRequestBody(jsonType)).build()
        }
        http.newCall(request).execute().use { response ->
            val responseText = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                val message = runCatching { JSONObject(responseText).optString("message").ifBlank { JSONObject(responseText).optString("error") } }.getOrNull()
                throw IOException(message?.ifBlank { null } ?: "Supabase request failed (${response.code}).")
            }
            when {
                responseText.isBlank() -> JSONObject()
                responseText.trimStart().startsWith("[") -> JSONObject().put("data", JSONArray(responseText))
                else -> JSONObject(responseText)
            }
        }
    }

    override fun onDestroy() {
        if (isFinishing) {
            room?.let { activeRoom -> lifecycleScope.launch { activeRoom.disconnect(); activeRoom.release() } }
        }
        super.onDestroy()
    }

    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()

    companion object {
        private val jsonType = "application/json; charset=utf-8".toMediaType()
    }
}
