atomLinter = require("atom-linter")
fs = require("fs")
path = require("path")

messageRegex = new RegExp([
  "^([^:\\n\\r]+):"   # File path
  "(\\d+):(\\d+):"    # Line and column
  " (error|warning):" # Message type
  " ([^\\n\\r]+)"     # Message
].join(""), "gm")

module.exports =
LinterLilyPond =
  config:
    executablePath:
      title: "Path of LilyPond executable"
      type: "string"
      default: "lilypond"

  provideLinter: ->
    return {
      name: "lilypond"
      grammarScopes: ["source.lilypond"]
      scope: "file"
      lintsOnChange: true

      lint: (editor) ->
        return new Promise((resolve) ->
          messages = []

          filePath = editor.getPath()
          if !filePath?
            resolve(messages)

          fileDirectory = path.dirname(filePath)

          parameters = [
            "--loglevel=WARNING"            # Output errors and warnings
            "--define-default=backend=null" # Don’t create PDFs
            "-"                             # Read input from stdin
          ]
          options = {
            cwd: fileDirectory
            timeout: 5 * 60 * 1000 # LilyPond may take a while to cache fonts.
            stdin: editor.getText()
            stream: "stderr"
            allowEmptyStderr: true
            uniqueKey: "linter-lilypond:#{filePath}"
          }
          atomLinter.exec(atom.config.get("linter-lilypond.executablePath"), parameters, options).then((stderr) ->
            # A LilyPond \midi block will produce a MIDI file named -.midi;
            # delete this.
            fs.unlink(path.join(fileDirectory, "-.midi"), (error) ->
              if error and error.code isnt "ENOENT"
                throw error
            )

            if stderr?
              while (result = messageRegex.exec(stderr))
                line = Number.parseInt(result[2], 10) - 1
                column = Number.parseInt(result[3], 10) - 1

                if result[1] is "-"
                  messageFilePath = filePath
                  position = atomLinter.generateRange(editor, line, column)
                else
                  if path.isAbsolute(result[1])
                    messageFilePath = result[1]
                  else
                    messageFilePath = path.resolve(fileDirectory, result[1])
                  fileEditor = atom.workspace.getTextEditors().find((editor) -> editor.getPath() is messageFilePath)
                  if fileEditor?
                    position = atomLinter.generateRange(fileEditor, line, column)
                  else
                    position = [[line, column], [line, column]]

                messages.push(
                  severity: result[4]
                  location:
                    file: messageFilePath
                    position: position
                  excerpt: result[5]
                )
            else
              messages = null

            resolve(messages)
          )
        )
    }
