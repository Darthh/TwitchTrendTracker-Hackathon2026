Option Explicit

Dim shell, files, runnerPath, powerShellPath, command
If WScript.Arguments.Count <> 1 Then WScript.Quit 2

Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
runnerPath = files.BuildPath(files.GetParentFolderName(WScript.ScriptFullName), "collect-scheduled.ps1")
powerShellPath = shell.ExpandEnvironmentStrings("%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe")
command = Quote(powerShellPath) & " -NoProfile -NonInteractive -WindowStyle Hidden -File " & Quote(runnerPath) & " -NodePath " & Quote(WScript.Arguments(0))

' Hide the console at process creation, before PowerShell or Windows Terminal can show it.
' Wait and return the collector exit code so Task Scheduler retains its status and overlap guard.
WScript.Quit shell.Run(command, 0, True)

Function Quote(value)
  Quote = Chr(34) & value & Chr(34)
End Function
