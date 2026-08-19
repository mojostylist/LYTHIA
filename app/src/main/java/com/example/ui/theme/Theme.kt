package com.example.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable

private val CosmicColorScheme = darkColorScheme(
    primary = GoldPrimary,
    secondary = AquaPrimary,
    tertiary = GoldAccent,
    background = CosmicBackground,
    surface = CosmicSurface,
    surfaceVariant = CosmicSurfaceVariant,
    onPrimary = CosmicBackground,
    onSecondary = CosmicBackground,
    onBackground = CosmicTextPrimary,
    onSurface = CosmicTextPrimary,
    onSurfaceVariant = CosmicTextSecondary
)

@Composable
fun MyApplicationTheme(
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = CosmicColorScheme,
        typography = Typography,
        content = content
    )
}
