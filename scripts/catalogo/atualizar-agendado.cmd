@echo off
rem Tarefa agendada "Nova Leoes estoque do site": atualiza preco e estoque do site a partir do ERP.
rem Roda no clone dedicado C:\dev\novaleoes-site-estoque (sempre na main). Log em %TEMP%\nl-estoque-site.log
cd /d C:\dev\novaleoes-site-estoque || exit /b 1
echo ==== %date% %time% >> "%TEMP%\nl-estoque-site.log"
node scripts\catalogo\atualizar.mjs >> "%TEMP%\nl-estoque-site.log" 2>&1
echo saida %errorlevel% >> "%TEMP%\nl-estoque-site.log"
