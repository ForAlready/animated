@echo off
chcp 65001 >nul
cd /d "%~dp0"
"C:\Users\小可乐\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" serve.py
pause
