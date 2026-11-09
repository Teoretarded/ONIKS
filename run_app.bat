@echo off
rem ONIKS as a native app (app/, Rust + Tauri over WebView2). Builds it the first time.
cd /d "%~dp0"
if not exist app\target\release\oniks.exe (
  pushd app
  "%USERPROFILE%\.cargo\bin\cargo.exe" build --release || (popd & pause & exit /b 1)
  popd
)
start "" app\target\release\oniks.exe
