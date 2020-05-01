atomLinter = require("atom-linter")
path = require("path")

messageRegex = new RegExp([
  "^[^:\\n\\r]+:"     # File path
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

          parameters = [
            "--loglevel=WARNING"            # Output errors and warnings
            "--define-default=backend=null" # Don’t create PDFs
            "-"                             # Read input from stdin
          ]
          options = {
            cwd: path.dirname(filePath)
            timeout: 5 * 60 * 1000 # LilyPond may take a while to cache fonts.
            stdin: editor.getText()
            stream: "stderr"
            allowEmptyStderr: true
            uniqueKey: "linter-lilypond:#{filePath}"
          }
          atomLinter.exec(atom.config.get("linter-lilypond.executablePath"), parameters, options).then((stderr) ->
            if stderr?
              while (result = messageRegex.exec(stderr))
                messages.push(
                  severity: result[3]
                  location:
                    file: filePath
                    position: atomLinter.generateRange(
                      editor
                      Number.parseInt(result[1], 10) - 1
                      Number.parseInt(result[2], 10) - 1
                    )
                  excerpt: result[4]
                )
            else
              messages = null

            resolve(messages)
          )
        )
    }
