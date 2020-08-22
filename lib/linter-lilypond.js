const atomLinter = require("atom-linter");
const fs = require("fs");
const path = require("path");

const messageRegex = new RegExp([
  "^([^:\\n\\r]+):",   // File path
  "(\\d+):(\\d+):",    // Line and column
  " (error|warning):", // Message type
  " ([^\\n\\r]+)"      // Message
].join(""), "gm");

module.exports = {
  config: {
    executablePath: {
      title: "Path of LilyPond executable",
      type: "string",
      default: "lilypond"
    }
  },

  provideLinter() {
    return {
      name: "lilypond",
      grammarScopes: ["source.lilypond"],
      scope: "file",
      lintsOnChange: true,

      lint(editor) {
        return new Promise(resolve => {
          let messages = [];

          const filePath = editor.getPath();
          if (!filePath)
            return resolve(messages);

          const parameters = [
            "--loglevel=WARNING",            // Output errors and warnings.
            "--define-default=backend=null", // Don’t create PDFs.
            "-"                              // Read input from stdin.
          ];
          const fileDirectory = path.dirname(filePath);
          const options = {
            cwd: fileDirectory,
            timeout: 5 * 60 * 1000, // LilyPond may take a while to cache fonts.
            stdin: editor.getText(),
            stream: "stderr",
            allowEmptyStderr: true,
            uniqueKey: `linter-lilypond:${filePath}`
          };
          atomLinter.exec(atom.config.get("linter-lilypond.executablePath"), parameters, options).then(stderr => {
            // A LilyPond \midi block will produce a MIDI file named -.midi;
            // delete this.
            fs.unlink(path.join(fileDirectory, "-.midi"), error => {
              if (error && error.code !== "ENOENT")
                throw error;
            });

            if (stderr) {
              let result;
              while ((result = messageRegex.exec(stderr))) {
                const line = Number.parseInt(result[2], 10) - 1;
                const column = Number.parseInt(result[3], 10) - 1;

                const message = {
                  severity: result[4],
                  location: {},
                  excerpt: result[5]
                };

                if (result[1] === "-") {
                  message.location.file = filePath;
                  message.location.position = atomLinter.generateRange(editor, line, column);
                } else {
                  message.location.file = path.isAbsolute(result[1]) ? result[1] : path.resolve(fileDirectory, result[1]);
                  const fileEditor = atom.workspace.getTextEditors().find(editor => editor.getPath() === message.location.file);
                  message.location.position = fileEditor ? atomLinter.generateRange(fileEditor, line, column) : [[line, column], [line, column]];
                }

                messages.push(message);
              }
            } else {
              messages = null;
            }

            resolve(messages);
          });
        });
      }
    };
  }
};
