@echo off
REM Double-click to open the Krilljoy question editor in your browser.
REM Close this window (or press Ctrl+C) to stop it.
title Krilljoy question editor
cd /d "%~dp0"
REM Get the nightly rebuild's changes first (does nothing if there's nothing new;
REM if you have unpushed changes it just skips, it never overwrites your work)
git pull --ff-only
python pipeline\admin.py
if errorlevel 1 pause
