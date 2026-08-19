package com.example.audio

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.tanh

class HarmonicSynthesizer(private val scope: CoroutineScope) {
    private var audioTrack: AudioTrack? = null
    private var synthJob: Job? = null
    @Volatile private var isPlaying = false

    // State parameters that can be adjusted dynamically in real-time
    @Volatile var frequency1: Double = 144.0 // Hz
    @Volatile var frequency2: Double = 144.0 // Hz (for binaural/harmonics)
    @Volatile var isBinaural: Boolean = false
    @Volatile var waveType: Int = 4 // 4 = 144Hz Sacred Stress Relief Metatron Pad
    @Volatile var volume: Float = 0.65f

    fun start() {
        if (isPlaying) return
        isPlaying = true

        val sampleRate = 44100
        val minBufferSize = AudioTrack.getMinBufferSize(
            sampleRate,
            AudioFormat.CHANNEL_OUT_STEREO,
            AudioFormat.ENCODING_PCM_16BIT
        )

        val bufferSize = (minBufferSize * 4).coerceAtLeast(sampleRate / 4)

        try {
            audioTrack = AudioTrack.Builder()
                .setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                        .build()
                )
                .setAudioFormat(
                    AudioFormat.Builder()
                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .setSampleRate(sampleRate)
                        .setChannelMask(AudioFormat.CHANNEL_OUT_STEREO)
                        .build()
                )
                .setBufferSizeInBytes(bufferSize)
                .setTransferMode(AudioTrack.MODE_STREAM)
                .build()

            if (audioTrack?.state == AudioTrack.STATE_INITIALIZED) {
                audioTrack?.play()
            } else {
                isPlaying = false
                return
            }
        } catch (e: Throwable) {
            isPlaying = false
            return
        }

        synthJob = scope.launch(Dispatchers.Default) {
            val sampleCount = 2048 // Smooth ~46ms processing chunks for low latency and zero dropouts
            val buffer = ShortArray(sampleCount * 2) // Stereo (L, R)

            // Independent, continuous phase accumulators for zero-discontinuity synthesis
            var pFundamental1 = 0.0
            var pFundamental2 = 0.0
            var pOctave1 = 0.0
            var pOctave2 = 0.0
            var pFifth1 = 0.0
            var pFifth2 = 0.0
            var pSub1 = 0.0
            var pSub2 = 0.0
            var pNinth1 = 0.0
            var pNinth2 = 0.0
            var pShimmer1 = 0.0
            var pShimmer2 = 0.0

            // Ambient modulation & breathing state
            var lfoBreathPhase = 0.0
            var lfoChorusPhase = 0.0
            var masterGainEnvelope = 0.0 // Soft attack ramp

            var chimePhase = 0.0
            var chimeEnvelope = 0.0
            var chimeFreq = 432.0
            var chimeTimer = 0

            // Smooth parameter slewing (prevents zipper noise / clicks on adjustments)
            var currentF1 = frequency1.coerceIn(20.0, 2000.0)
            var currentF2 = if (isBinaural) frequency2.coerceIn(20.0, 2000.0) else currentF1
            var currentVol = volume.coerceIn(0.0f, 1.0f).toDouble()

            val twoPi = 2.0 * Math.PI
            val invSampleRate = 1.0 / sampleRate

            while (isActive && isPlaying) {
                val targetF1 = frequency1.coerceIn(20.0, 2000.0)
                val targetF2 = if (isBinaural) frequency2.coerceIn(20.0, 2000.0) else targetF1
                val targetVol = volume.coerceIn(0.0f, 1.0f).toDouble()
                val activeWave = waveType

                for (i in 0 until sampleCount) {
                    // Smooth parameter interpolation
                    currentF1 += (targetF1 - currentF1) * 0.002
                    currentF2 += (targetF2 - currentF2) * 0.002
                    currentVol += (targetVol - currentVol) * 0.002

                    // Soft attack envelope (prevents start clicks)
                    if (masterGainEnvelope < 1.0) {
                        masterGainEnvelope = (masterGainEnvelope + 0.0005).coerceAtMost(1.0)
                    }

                    // Continuous slow breathing LFO (~0.05Hz = 20-second cosmic breathing cycle)
                    lfoBreathPhase += twoPi * 0.05 * invSampleRate
                    if (lfoBreathPhase >= twoPi) lfoBreathPhase -= twoPi
                    val breath = 0.75 + 0.25 * sin(lfoBreathPhase)

                    // Subtle chorus drift
                    lfoChorusPhase += twoPi * 0.2 * invSampleRate
                    if (lfoChorusPhase >= twoPi) lfoChorusPhase -= twoPi
                    val chorusOffset = 0.4 * sin(lfoChorusPhase) // Hz subtle detune

                    val fL = currentF1
                    val fR = currentF2 + chorusOffset

                    // Advance each harmonic with its own continuous phase accumulator
                    pFundamental1 = (pFundamental1 + twoPi * fL * invSampleRate) % twoPi
                    pFundamental2 = (pFundamental2 + twoPi * fR * invSampleRate) % twoPi

                    pSub1 = (pSub1 + twoPi * (fL * 0.5) * invSampleRate) % twoPi
                    pSub2 = (pSub2 + twoPi * (fR * 0.5) * invSampleRate) % twoPi

                    pOctave1 = (pOctave1 + twoPi * (fL * 2.0) * invSampleRate) % twoPi
                    pOctave2 = (pOctave2 + twoPi * (fR * 2.0) * invSampleRate) % twoPi

                    pFifth1 = (pFifth1 + twoPi * (fL * 1.5) * invSampleRate) % twoPi // Exact 3:2 pure fifth / 432Hz from 144Hz
                    pFifth2 = (pFifth2 + twoPi * (fR * 1.5) * invSampleRate) % twoPi

                    pNinth1 = (pNinth1 + twoPi * (fL * 2.25) * invSampleRate) % twoPi
                    pNinth2 = (pNinth2 + twoPi * (fR * 2.25) * invSampleRate) % twoPi

                    pShimmer1 = (pShimmer1 + twoPi * (fL * 3.0) * invSampleRate) % twoPi
                    pShimmer2 = (pShimmer2 + twoPi * (fR * 3.0) * invSampleRate) % twoPi

                    // Crystal bell / chime gentle trigger
                    chimeTimer++
                    if (chimeTimer > 176400) { // ~4 seconds
                        chimeTimer = 0
                        chimeFreq = fL * if (Math.random() > 0.5) 3.0 else 2.0
                        chimeEnvelope = 0.22
                    }
                    if (chimeEnvelope > 0.0001) {
                        chimePhase = (chimePhase + twoPi * chimeFreq * invSampleRate) % twoPi
                        chimeEnvelope *= 0.99991 // Smooth exponential decay
                    } else {
                        chimeEnvelope = 0.0
                    }
                    val bell = sin(chimePhase) * chimeEnvelope

                    var sampleL: Double
                    var sampleR: Double

                    when (activeWave) {
                        4 -> {
                            // 144 Hz Sacred Stress Relief & Metatron Nervous System Calming Pad:
                            // Pure, silky smooth organic harmonics with ZERO static or phase discontinuities
                            val fundL = sin(pFundamental1) * 0.52
                            val fundR = sin(pFundamental2) * 0.52

                            val subL = sin(pSub1) * 0.30 // 72Hz grounding carrier
                            val subR = sin(pSub2) * 0.30

                            val octL = sin(pOctave1) * 0.22 // 288Hz octave warmth
                            val octR = sin(pOctave2) * 0.22

                            val solfeggio5thL = sin(pFifth1) * 0.24 // 432Hz sacred harmonic 3rd
                            val solfeggio5thR = sin(pFifth2) * 0.24

                            val softNinthL = sin(pNinth1) * 0.08
                            val softNinthR = sin(pNinth2) * 0.08

                            sampleL = (fundL + subL + octL + solfeggio5thL + softNinthL) * breath + bell * 0.35
                            sampleR = (fundR + subR + octR + solfeggio5thR + softNinthR) * breath + bell * 0.35
                        }
                        0 -> {
                            // Celestial Harmony Pad & Solfeggio
                            val fundL = sin(pFundamental1) * 0.45
                            val fundR = sin(pFundamental2) * 0.45
                            val subL = sin(pSub1) * 0.35
                            val subR = sin(pSub2) * 0.35
                            val fifthL = sin(pFifth1) * 0.25
                            val fifthR = sin(pFifth2) * 0.25
                            sampleL = (fundL + subL + fifthL) * breath + bell * 0.5
                            sampleR = (fundR + subR + fifthR) * breath + bell * 0.5
                        }
                        1 -> {
                            // Resonance Singing Bowls
                            val bowlL = (sin(pFundamental1) * 0.55 + sin(pOctave1) * 0.25 + sin(pFifth1) * 0.20) * breath
                            val bowlR = (sin(pFundamental2) * 0.55 + sin(pOctave2) * 0.25 + sin(pFifth2) * 0.20) * breath
                            sampleL = bowlL + bell * 0.4
                            sampleR = bowlR + bell * 0.4
                        }
                        2 -> {
                            // Cosmic Binaural Deep Drone
                            sampleL = (sin(pFundamental1) * 0.55 + sin(pSub1) * 0.40) * breath
                            sampleR = (sin(pFundamental2) * 0.55 + sin(pSub2) * 0.40) * breath
                        }
                        3 -> {
                            // Tibetan Deep Grounding Choir
                            val v1L = sin(pFundamental1) * 0.50
                            val v1R = sin(pFundamental2) * 0.50
                            val v2L = sin(pSub1) * 0.35
                            val v2R = sin(pSub2) * 0.35
                            val v3L = sin(pFifth1) * 0.22
                            val v3R = sin(pFifth2) * 0.22
                            sampleL = (v1L + v2L + v3L) * breath
                            sampleR = (v1R + v2R + v3R) * breath
                        }
                        5 -> {
                            // Crystal Singing Bowls
                            val c1L = sin(pFundamental1) * 0.48
                            val c1R = sin(pFundamental2) * 0.48
                            val c2L = sin(pOctave1) * 0.28
                            val c2R = sin(pOctave2) * 0.28
                            val c3L = sin(pShimmer1) * 0.14
                            val c3R = sin(pShimmer2) * 0.14
                            sampleL = (c1L + c2L + c3L) * breath + bell * 0.6
                            sampleR = (c1R + c2R + c3R) * breath + bell * 0.6
                        }
                        else -> {
                            // Velvet Serenity Ambient Soundscape
                            val vL = (sin(pFundamental1) * 0.45 + sin(pSub1) * 0.35 + sin(pFifth1) * 0.20) * breath
                            val vR = (sin(pFundamental2) * 0.45 + sin(pSub2) * 0.35 + sin(pFifth2) * 0.20) * breath
                            sampleL = vL
                            sampleR = vR
                        }
                    }

                    // Soft analog saturation (tanh) - prevents harsh clipping and provides warm acoustic density
                    val warmL = tanh(sampleL * masterGainEnvelope)
                    val warmR = tanh(sampleR * masterGainEnvelope)

                    val finalVol = currentVol * 30000.0
                    buffer[i * 2] = (warmL * finalVol).toInt().coerceIn(-32767, 32767).toShort()
                    buffer[i * 2 + 1] = (warmR * finalVol).toInt().coerceIn(-32767, 32767).toShort()
                }

                try {
                    audioTrack?.write(buffer, 0, buffer.size)
                } catch (e: Throwable) {
                    break
                }
            }
        }
    }

    fun stop() {
        isPlaying = false
        synthJob?.cancel()
        synthJob = null
        try {
            audioTrack?.stop()
            audioTrack?.release()
        } catch (e: Throwable) {
            // Safe teardown
        }
        audioTrack = null
    }

    fun isPlaying(): Boolean = isPlaying
}
