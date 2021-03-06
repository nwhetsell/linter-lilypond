const atomLinter = require("atom-linter");
const fs = require("fs");
const os = require("os");
const path = require("path");

const messageRegex = new RegExp([
  "^([^:\\n\\r]+):",     // File path
  "(\\d+):(?:(\\d+):)?", // Line and column
  " (error|warning):",   // Message type
  " ([^\\n\\r]+)"        // Message
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

          const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "linter-lilypond-"));
          const parameters = [
            "--define-default=backend=null", // Don’t create output files.
            "--loglevel=WARNING",            // Output errors and warnings.
            `--output=${outputDirectory}`,   // Write output files to a temporary directory.
            "-"                              // Read input from stdin.
          ];
          // If
          //   #(ly:set-option 'backend '<backend>)
          // is used, as in
          //   https://github.com/lilypond/lilypond/blob/stable/2.22/ly/lilypond-book-preamble.ly#L45
          // LilyPond may write output files even when including a parameter of
          //   --define-default=backend=null
          // Setting a null backend with a parameter *and* writing output to a
          // temporary directory should eliminate all output files. (Run
          //   lilypond --loglevel=ERROR - <<< '#(ly:option-usage)'
          // to see the values to which backend can be set.)

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
            for (const fileName of fs.readdirSync(outputDirectory)) {
              fs.unlinkSync(path.join(outputDirectory, fileName));
            }
            fs.rmdirSync(outputDirectory);

            if (stderr) {
              let result;
              while ((result = messageRegex.exec(stderr))) {
                const line = Number.parseInt(result[2], 10) - 1;
                const reportedColumn = result[3];
                const column = reportedColumn ? Number.parseInt(reportedColumn, 10) - 1 : 0;

                const message = {
                  severity: result[4],
                  location: {},
                  excerpt: result[5]
                };

                if (result[1] === "-") {
                  message.location.file = filePath;
                  message.location.position = reportedColumn ? atomLinter.generateRange(editor, line, column) : [[line, column], [line, column]];
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
