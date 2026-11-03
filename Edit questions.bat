@echo off
REM Double-click to open the Vallion question editor in your browser.
REM Close this window (or press Ctrl+C) to stop it.
title Vallion question editor
cd /d "%~dp0"
python pipeline\admin.py
if errorlevel 1 pause
