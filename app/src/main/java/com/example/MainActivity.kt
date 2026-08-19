package com.example

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.example.ui.LithiaApp
import com.example.ui.LithiaViewModel
import com.example.ui.theme.MyApplicationTheme
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay
import android.widget.Toast
import java.util.Locale

class MainActivity : ComponentActivity(), TextToSpeech.OnInitListener {

    private val viewModel: LithiaViewModel by viewModels()
    private var tts: TextToSpeech? = null
    private var isTtsReady = false
    private var speechRecognizer: SpeechRecognizer? = null
    private var currentSpeechLastUtteranceId: String? = null
    private var lastSpokenTextContent: String? = null
    private var lastSpokenTimestamp: Long = 0L

    private val speechActivityResultLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        try {
            viewModel.setMuteState(true, this@MainActivity)
            if (result.resultCode == RESULT_OK && result.data != null) {
                val matches = result.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
                if (!matches.isNullOrEmpty()) {
                    val spokenText = matches[0]
                    if (!spokenText.isNullOrBlank()) {
                        viewModel.sendMessage(spokenText)
                    }
                }
            }
        } catch (e: Throwable) {
            e.printStackTrace()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Set global resilient uncaught exception handler to prevent hard crashes on tablets
        try {
            val defaultHandler = Thread.getDefaultUncaughtExceptionHandler()
            Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
                android.util.Log.e("MainActivity", "Uncaught exception intercepted safely: ${throwable.message}", throwable)
                if (throwable !is OutOfMemoryError) {
                    try {
                        viewModel.setLithiaSpeaking(false)
                        viewModel.stopAllAudio()
                    } catch (t: Throwable) {
                        // ignore secondary errors
                    }
                } else {
                    defaultHandler?.uncaughtException(thread, throwable)
                }
            }
        } catch (e: Throwable) {
            e.printStackTrace()
        }

        // Initialize Text-To-Speech safely
        try {
            tts = TextToSpeech(this, this)
        } catch (e: Throwable) {
            e.printStackTrace()
            isTtsReady = false
        }

        enableEdgeToEdge()
        setContent {
            MyApplicationTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = androidx.compose.material3.MaterialTheme.colorScheme.background
                ) {
                    LithiaApp(viewModel = viewModel)
                }
            }
        }

        // Collect speech request triggers from the ViewModel
        lifecycleScope.launch {
            lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
                launch {
                    viewModel.speakEvent.collectLatest { text ->
                        try {
                            speakText(text)
                        } catch (e: Throwable) {
                            e.printStackTrace()
                            viewModel.setLithiaSpeaking(false)
                        }
                    }
                }

                launch {
                    viewModel.documentExportEvent.collectLatest { docData ->
                        runOnUiThread {
                            try {
                                com.example.ui.saveTextToPdf(
                                    context = this@MainActivity,
                                    title = docData.title,
                                    content = com.example.ui.cleanDisplayText(docData.content),
                                    fileNamePrefix = docData.prefix
                                )
                                com.example.ui.saveMessageToTxt(
                                    context = this@MainActivity,
                                    message = com.example.data.MessageEntity(isUser = false, text = com.example.ui.cleanDisplayText(docData.content))
                                )
                            } catch (e: Throwable) {
                                e.printStackTrace()
                            }
                        }
                    }
                }

                launch {
                    viewModel.stopSpeakEvent.collectLatest {
                        runOnUiThread {
                            try {
                                if (isTtsReady && tts != null) {
                                    tts?.stop()
                                    viewModel.setLithiaSpeaking(false)
                                }
                            } catch (e: Throwable) {
                                e.printStackTrace()
                            }
                        }
                    }
                }
                
                // Collect isRecording to start/stop SpeechRecognizer
                launch {
                    val recognizerIntent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                        putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.US.toString())
                        putExtra(RecognizerIntent.EXTRA_PROMPT, "Speak to Lythia...")
                    }
                    viewModel.isRecording.collectLatest { recording ->
                        if (recording) {
                            // Instantly stop Text-To-Speech playback when microphone starts to allow interrupting Lythia!
                            try {
                                if (isTtsReady && tts != null) {
                                    tts?.stop()
                                    viewModel.setLithiaSpeaking(false)
                                }
                            } catch (e: Throwable) {
                                e.printStackTrace()
                            }
                            
                            // Settle down the audio hardware/speaker to avoid capturing feedback echo
                            delay(250)

                            runOnUiThread {
                                try {
                                    val hasPermission = ContextCompat.checkSelfPermission(
                                        this@MainActivity,
                                        Manifest.permission.RECORD_AUDIO
                                    ) == PackageManager.PERMISSION_GRANTED
                                    
                                    if (hasPermission) {
                                        var startedInAppRecognizer = false
                                        try {
                                            val isAvailable = try {
                                                SpeechRecognizer.isRecognitionAvailable(this@MainActivity)
                                            } catch (e: Throwable) {
                                                false
                                            }
                                            if (isAvailable) {
                                                if (speechRecognizer == null) {
                                                    try {
                                                        speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this@MainActivity)
                                                    } catch (e: Throwable) {
                                                        e.printStackTrace()
                                                        speechRecognizer = null
                                                    }
                                                }
                                                if (speechRecognizer != null) {
                                                    try {
                                                        speechRecognizer?.setRecognitionListener(object : RecognitionListener {
                                                            override fun onReadyForSpeech(params: Bundle?) {}
                                                            override fun onBeginningOfSpeech() {}
                                                            override fun onRmsChanged(rmsdB: Float) {
                                                                val normalized = (rmsdB / 10f).coerceIn(0f, 1f)
                                                                viewModel.setAmplitude(normalized)
                                                            }
                                                            override fun onBufferReceived(buffer: ByteArray?) {}
                                                            override fun onEndOfSpeech() {}
                                                            override fun onError(error: Int) {
                                                                val pendingText = viewModel.liveVoiceText.value
                                                                if (!pendingText.isNullOrBlank() && (error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT || error == SpeechRecognizer.ERROR_NO_MATCH)) {
                                                                    viewModel.sendMessage(pendingText)
                                                                    viewModel.clearLiveVoiceText()
                                                                    viewModel.setMuteState(true, this@MainActivity)
                                                                } else if (error == SpeechRecognizer.ERROR_CLIENT || error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY || error == SpeechRecognizer.ERROR_AUDIO) {
                                                                    try {
                                                                        speechRecognizer?.cancel()
                                                                        speechRecognizer?.destroy()
                                                                    } catch (t: Throwable) {}
                                                                    speechRecognizer = null
                                                                    try {
                                                                        if (recognizerIntent.resolveActivity(packageManager) != null) {
                                                                            speechActivityResultLauncher.launch(recognizerIntent)
                                                                        } else {
                                                                            viewModel.setMuteState(true, this@MainActivity)
                                                                        }
                                                                    } catch (ex: Throwable) {
                                                                        viewModel.setMuteState(true, this@MainActivity)
                                                                    }
                                                                } else {
                                                                    viewModel.setMuteState(true, this@MainActivity)
                                                                }
                                                            }
                                                            override fun onResults(results: Bundle?) {
                                                                val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                                                                if (!matches.isNullOrEmpty()) {
                                                                    val spokenText = matches[0]
                                                                    if (!spokenText.isNullOrBlank()) {
                                                                        viewModel.sendMessage(spokenText)
                                                                        viewModel.clearLiveVoiceText()
                                                                    }
                                                                }
                                                                viewModel.setMuteState(true, this@MainActivity)
                                                            }
                                                            override fun onPartialResults(partialResults: Bundle?) {
                                                                val matches = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                                                                if (!matches.isNullOrEmpty()) {
                                                                    val spokenText = matches[0]
                                                                    if (!spokenText.isNullOrBlank()) {
                                                                        viewModel.updateLiveVoiceText(spokenText)
                                                                    }
                                                                }
                                                            }
                                                            override fun onEvent(eventType: Int, params: Bundle?) {}
                                                        })
                                                        speechRecognizer?.startListening(recognizerIntent)
                                                        startedInAppRecognizer = true
                                                    } catch (e: Throwable) {
                                                        e.printStackTrace()
                                                        startedInAppRecognizer = false
                                                        try {
                                                            speechRecognizer?.destroy()
                                                        } catch (t: Throwable) {}
                                                        speechRecognizer = null
                                                    }
                                                }
                                            }
                                        } catch (e: Throwable) {
                                            e.printStackTrace()
                                            startedInAppRecognizer = false
                                        }

                                        if (!startedInAppRecognizer) {
                                            try {
                                                if (recognizerIntent.resolveActivity(packageManager) != null) {
                                                    speechActivityResultLauncher.launch(recognizerIntent)
                                                } else {
                                                    Toast.makeText(
                                                        this@MainActivity,
                                                        "Voice recognition unavailable. Please type your query.",
                                                        Toast.LENGTH_SHORT
                                                    ).show()
                                                    viewModel.setMuteState(true, this@MainActivity)
                                                }
                                            } catch (e: Throwable) {
                                                e.printStackTrace()
                                                Toast.makeText(
                                                    this@MainActivity,
                                                    "Voice recognition unavailable. Please type your query.",
                                                    Toast.LENGTH_SHORT
                                                ).show()
                                                viewModel.setMuteState(true, this@MainActivity)
                                            }
                                        }
                                    } else {
                                        viewModel.setMuteState(true, this@MainActivity)
                                    }
                                } catch (e: Throwable) {
                                    e.printStackTrace()
                                    viewModel.setMuteState(true, this@MainActivity)
                                }
                            }
                        } else {
                            runOnUiThread {
                                try {
                                    speechRecognizer?.cancel()
                                    speechRecognizer?.destroy()
                                } catch (e: Throwable) {
                                    e.printStackTrace()
                                } finally {
                                    speechRecognizer = null
                                }
                            }
                        }
                    }
                }
                
                // Collect and apply pitch, rate, and voice presets in real-time
                launch {
                    viewModel.voicePitch.collectLatest { pitch ->
                        try {
                            if (isTtsReady) {
                                tts?.setPitch(pitch.coerceIn(0.5f, 2.0f))
                                lastSpokenTextContent = null
                                lastSpokenTimestamp = 0L
                            }
                        } catch (e: Throwable) {
                            e.printStackTrace()
                        }
                    }
                }
                launch {
                    viewModel.voiceRate.collectLatest { rate ->
                        try {
                            if (isTtsReady) {
                                tts?.setSpeechRate(rate.coerceIn(0.4f, 2.0f))
                                lastSpokenTextContent = null
                                lastSpokenTimestamp = 0L
                            }
                        } catch (e: Throwable) {
                            e.printStackTrace()
                        }
                    }
                }
                launch {
                    viewModel.selectedVoiceName.collectLatest { voiceName ->
                        if (isTtsReady && voiceName != null) {
                            try {
                                val activeVoice = tts?.voices?.firstOrNull { it.name == voiceName }
                                if (activeVoice != null) {
                                    tts?.voice = activeVoice
                                    lastSpokenTextContent = null
                                    lastSpokenTimestamp = 0L
                                }
                            } catch (e: Throwable) {
                                e.printStackTrace()
                            }
                        }
                    }
                }
            }
        }
    }

    override fun onInit(status: Int) {
        if (status == TextToSpeech.SUCCESS) {
            try {
                tts?.let { t ->
                    var result = t.setLanguage(Locale.US)
                    if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                        result = t.setLanguage(Locale.getDefault())
                    }
                    isTtsReady = true
                    
                    // Apply default soothing tuning
                    t.setPitch(viewModel.voicePitch.value)
                    t.setSpeechRate(viewModel.voiceRate.value)

                        // Safely query available voices from the engine
                        val allVoices = try {
                            t.voices?.toList() ?: emptyList()
                        } catch (e: Throwable) {
                            emptyList()
                        }

                        // Filter for English language voices with full null safety
                        val englishVoices = allVoices.filter { voice ->
                            try {
                                voice.locale?.language == "en"
                            } catch (e: Throwable) {
                                false
                            }
                        }

                        val voiceNames = englishVoices.mapNotNull { it.name }.distinct().sorted()
                        viewModel.setAvailableVoiceNames(voiceNames)

                        // Find preferred higher-quality female contralto neural voice profile
                        val preferredVoice = englishVoices.firstOrNull { voice ->
                            try {
                                val name = voice.name?.lowercase() ?: ""
                                val isFemaleOrContralto = name.contains("female") || name.contains("sfg") || name.contains("tpf") ||
                                        name.contains("iol") || name.contains("iom") || name.contains("wavenet-c") ||
                                        name.contains("wavenet-f") || name.contains("neural2-f") || name.contains("studio-o")
                                val isNeural = name.contains("neural") || name.contains("wavenet") || name.contains("natural") || name.contains("studio")
                                isFemaleOrContralto && isNeural && !voice.isNetworkConnectionRequired
                            } catch (e: Throwable) {
                                false
                            }
                        } ?: englishVoices.firstOrNull { voice ->
                            try {
                                val name = voice.name?.lowercase() ?: ""
                                val isFemaleOrContralto = name.contains("female") || name.contains("sfg") || name.contains("tpf") ||
                                        name.contains("iol") || name.contains("iom") || name.contains("wavenet-c") ||
                                        name.contains("wavenet-f") || name.contains("neural2-f") || name.contains("studio-o")
                                val isNeural = name.contains("neural") || name.contains("wavenet") || name.contains("natural") || name.contains("studio")
                                isFemaleOrContralto || isNeural
                            } catch (e: Throwable) {
                                false
                            }
                        } ?: englishVoices.firstOrNull { voice ->
                            try {
                                val name = voice.name?.lowercase() ?: ""
                                (name.contains("neural") || name.contains("wavenet") || name.contains("natural")) && !voice.isNetworkConnectionRequired
                            } catch (e: Throwable) {
                                false
                            }
                        } ?: englishVoices.firstOrNull { voice ->
                            try {
                                voice.name?.contains("en-us-x", ignoreCase = true) == true
                            } catch (e: Throwable) {
                                false
                            }
                        } ?: englishVoices.firstOrNull()

                        if (preferredVoice != null && viewModel.selectedVoiceName.value == null) {
                            preferredVoice.name?.let { pName ->
                                viewModel.setSelectedVoiceName(pName)
                                try {
                                    t.voice = preferredVoice
                                } catch (e: Throwable) {
                                    // Safe fallback
                                }
                            }
                        }

                        t.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                            override fun onStart(utteranceId: String?) {
                                try {
                                    if (utteranceId != null && utteranceId.startsWith("LYTHIA_UTTERANCE_")) {
                                        runOnUiThread {
                                            viewModel.setLithiaSpeaking(true)
                                        }
                                    }
                                } catch (e: Throwable) {
                                    e.printStackTrace()
                                }
                            }

                            override fun onDone(utteranceId: String?) {
                                try {
                                    if (utteranceId == currentSpeechLastUtteranceId) {
                                        runOnUiThread {
                                            viewModel.setLithiaSpeaking(false)
                                        }
                                    }
                                } catch (e: Throwable) {
                                    e.printStackTrace()
                                }
                            }

                            @Suppress("DEPRECATION")
                            override fun onError(utteranceId: String?) {
                                try {
                                    if (utteranceId == currentSpeechLastUtteranceId) {
                                        runOnUiThread {
                                            viewModel.setLithiaSpeaking(false)
                                        }
                                    }
                                } catch (e: Throwable) {
                                    e.printStackTrace()
                                }
                            }
                        })
                    }
                } catch (e: Throwable) {
                    e.printStackTrace()
                }
            }
        }

    private fun speakText(text: String) {
        try {
            // Crucial: ensure microphone is muted/recording is stopped BEFORE speaking
            // to prevent Lythia's speaker voice from feeding back into the SpeechRecognizer microphone!
            viewModel.setMuteState(true, this)
            runOnUiThread {
                try {
                    speechRecognizer?.cancel()
                    speechRecognizer?.destroy()
                } catch (e: Throwable) {
                    // Ignore cleanup errors
                } finally {
                    speechRecognizer = null
                }
            }

            if (isTtsReady && tts != null) {
                val isPreview = text.contains("\u200B")
                val now = System.currentTimeMillis()
                val rawText = text.replace("\u200B", "").trim()

                if (!isPreview && rawText == lastSpokenTextContent && (now - lastSpokenTimestamp) < 1000L) {
                    return
                }
                if (isPreview) {
                    lastSpokenTextContent = null
                    lastSpokenTimestamp = 0L
                } else {
                    lastSpokenTextContent = rawText
                    lastSpokenTimestamp = now
                }

                // Preprocess text: remove markdown artifacts (*, #, _, `, ~, bullets) and normalize pronunciation
                val cleanSpacedLythia = Regex("(?i)l\\s+y\\s+t\\s+h\\s+i\\s+a")
                val cleanSpacedLithia = Regex("(?i)l\\s+i\\s+t\\s+h\\s+i\\s+a")
                val cleanDashedLythia = Regex("(?i)l-y-t-h-i-a")
                val cleanDashedLithia = Regex("(?i)l-i-t-h-i-a")
                val cleanDottedLythia = Regex("(?i)l\\.y\\.t\\.h\\.i\\.a")
                val cleanDottedLithia = Regex("(?i)l\\.i\\.t\\.h\\.i\\.a")

                var processedText = rawText
                    .replace(Regex("\\[CRITICAL CONTAINMENT CODE:[^\\]]*\\]"), "")
                    .replace(Regex("\\[OPERATIONAL STATUS:[^\\]]*\\]"), "")
                    .replace(Regex("\\[SECURITY FILTER:[^\\]]*\\]"), "")
                    .replace(Regex("\\[EMISSION MATRIX:[^\\]]*\\]"), "")
                    .replace(Regex("CREATED BY RENAE[^\n]*"), "")
                    .replace(cleanSpacedLythia, "lithia")
                    .replace(cleanSpacedLithia, "lithia")
                    .replace(cleanDashedLythia, "lithia")
                    .replace(cleanDashedLithia, "lithia")
                    .replace(cleanDottedLythia, "lithia")
                    .replace(cleanDottedLithia, "lithia")
                    .replace("LYTHIA", "lithia", ignoreCase = true)
                    .replace("LITHIA", "lithia", ignoreCase = true)
                    .replace("Lythia", "lithia", ignoreCase = true)
                    .replace("Lithia", "lithia", ignoreCase = true)
                    .replace("144 Hz", "144 Hertz", ignoreCase = true)
                    .replace("144Hz", "144 Hertz", ignoreCase = true)
                    .replace("432 Hz", "432 Hertz", ignoreCase = true)
                    .replace("432Hz", "432 Hertz", ignoreCase = true)
                    .replace("528 Hz", "528 Hertz", ignoreCase = true)
                    .replace("528Hz", "528 Hertz", ignoreCase = true)
                    .replace(" Hz", " Hertz")
                    .replace("—", ", ")
                    .replace(";", ", ")
                    // Remove markdown formatting so TTS engine doesn't stutter or speak symbols
                    .replace(Regex("\\*+"), "")
                    .replace(Regex("(?m)^\\s*#+\\s*"), "")
                    .replace(Regex("`+"), "")
                    .replace(Regex("(?m)^\\s*[-+*]\\s+"), "")
                    .replace(Regex("[~_]"), " ")
                    .replace(Regex("\\s+"), " ")
                    .trim()

                if (processedText.isEmpty()) {
                    viewModel.setLithiaSpeaking(false)
                    return
                }

                // Lock in stable pitch & rate ONCE on the engine before speaking
                val basePitch = viewModel.voicePitch.value.coerceIn(0.5f, 2.0f)
                val baseRate = viewModel.voiceRate.value.coerceIn(0.4f, 2.0f)
                tts?.setPitch(basePitch)
                tts?.setSpeechRate(baseRate)

                val maxInputLen = try {
                    TextToSpeech.getMaxSpeechInputLength().coerceIn(500, 3500)
                } catch (e: Throwable) {
                    2000
                }

                val chunks = if (processedText.length > maxInputLen) {
                    processedText.chunked(maxInputLen)
                } else {
                    listOf(processedText)
                }

                val baseUtteranceId = "LYTHIA_UTTERANCE_${System.currentTimeMillis()}"

                for ((index, chunk) in chunks.withIndex()) {
                    try {
                        val chunkUtteranceId = "${baseUtteranceId}_$index"
                        if (index == chunks.size - 1) {
                            currentSpeechLastUtteranceId = chunkUtteranceId
                        }
                        val params = Bundle().apply {
                            putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, chunkUtteranceId)
                        }
                        val mode = if (index == 0) TextToSpeech.QUEUE_FLUSH else TextToSpeech.QUEUE_ADD
                        tts?.speak(chunk, mode, params, chunkUtteranceId)
                    } catch (eChunk: Throwable) {
                        eChunk.printStackTrace()
                    }
                }
            } else {
                // Instantly toggle mandala talking animation to off if TTS is unavailable
                viewModel.setLithiaSpeaking(false)
            }
        } catch (e: Throwable) {
            e.printStackTrace()
            viewModel.setLithiaSpeaking(false)
        }
    }

    override fun onPause() {
        super.onPause()
        try {
            tts?.stop()
            viewModel.setLithiaSpeaking(false)
            viewModel.stopAllAudio()
            speechRecognizer?.stopListening()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    override fun onStop() {
        super.onStop()
        try {
            tts?.stop()
            viewModel.setLithiaSpeaking(false)
            viewModel.stopAllAudio()
            speechRecognizer?.stopListening()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        try {
            tts?.stop()
            tts?.shutdown()
            tts = null
            
            viewModel.stopAllAudio()
            
            speechRecognizer?.let {
                it.stopListening()
                it.destroy()
            }
            speechRecognizer = null
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
}
