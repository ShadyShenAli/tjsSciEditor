@echo off
setlocal

set ROOT=%~dp0..
set SRC=%~dp0
set DIST=%ROOT%\dist
set PLUGINS_DIR=%DIST%\plugins

echo [1/4] Creating dist folder...
if not exist "%DIST%" mkdir "%DIST%"
if not exist "%PLUGINS_DIR%" mkdir "%PLUGINS_DIR%"

echo [2/4] Bundling editor-tjs.js...
tjs.exe bundle "%SRC%editor-tjs.js" "%SRC%editor-tjs.bundle.js"
if not exist "%SRC%editor-tjs.bundle.js" (
    echo ERROR: bundle failed
    exit /b 1
)

echo [3/4] Compiling to executable...
tjs.exe compile "%SRC%editor-tjs.bundle.js" "%DIST%\editor.exe"
if not exist "%DIST%\editor.exe" (
    echo ERROR: compile failed
    exit /b 1
)
@rem del "%SRC%editor-tjs.bundle.js"

echo [4/4] Copying DLLs and plugins...
copy /y "%SRC%Scintilla.dll"    "%DIST%\"
copy /y "%SRC%Lexilla.dll"      "%DIST%\"
copy /y "%SRC%plugins\*.js"       "%PLUGINS_DIR%\"

echo.
echo Done. Contents of %DIST%:
dir /b "%DIST%"
echo.
dir /b "%PLUGINS_DIR%"
endlocal
