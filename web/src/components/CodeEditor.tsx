import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView } from "@codemirror/view";
import { useMemo } from "react";

export type Language = "python" | "javascript" | "typescript";

interface Props {
  value: string;
  onChange: (v: string) => void;
  language: Language;
  height?: string;
  readOnly?: boolean;
}

const lightTheme = EditorView.theme({
  "&": { backgroundColor: "var(--code-bg)", color: "var(--fg)" },
  ".cm-gutters": { backgroundColor: "var(--bg-elev-2)", color: "var(--fg-muted)", border: "none" },
  ".cm-activeLine": { backgroundColor: "rgba(0,0,0,0.04)" },
  ".cm-activeLineGutter": { backgroundColor: "rgba(0,0,0,0.06)" },
});

export function CodeEditor({ value, onChange, language, height = "320px", readOnly }: Props) {
  const dark = typeof document !== "undefined" && !document.documentElement.classList.contains("light");
  const extensions = useMemo(() => {
    const lang = language === "python" ? python() : javascript({ typescript: language === "typescript" });
    return [lang, EditorView.lineWrapping];
  }, [language]);
  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <CodeMirror
        value={value}
        height={height}
        theme={dark ? oneDark : lightTheme}
        extensions={extensions}
        onChange={onChange}
        readOnly={readOnly}
        basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: true, autocompletion: false, tabSize: 4 }}
        indentWithTab
      />
    </div>
  );
}
