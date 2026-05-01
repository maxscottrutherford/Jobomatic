import { useEffect, useRef } from "react";
import {
  Annotation,
  ChangeSet,
  Compartment,
  EditorState,
  EditorSelection,
} from "@codemirror/state";
import { basicSetup, EditorView } from "codemirror";
import { latex } from "codemirror-lang-latex";

const externalSync = Annotation.define<boolean>();

const heightTheme = EditorView.theme({
  "&": { height: "100%" },
  ".cm-scroller": { overflow: "auto" },
});

function languageSupport(language: "latex" | "plaintext") {
  if (language === "latex") {
    return latex({
      enableLinting: false,
      enableAutocomplete: false,
      enableTooltips: false,
    });
  }
  return [];
}

export type CodeEditorProps = {
  value: string;
  onChange: (value: string) => void;
  language: "latex" | "plaintext";
  readOnly?: boolean;
};

export function CodeEditor({
  value,
  onChange,
  language,
  readOnly = false,
}: CodeEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const languageConf = useRef(new Compartment());
  const readOnlyConf = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const mountDocRef = useRef<string | null>(null);
  const mountLanguageRef = useRef<"latex" | "plaintext" | null>(null);
  const mountReadOnlyRef = useRef<boolean | null>(null);
  if (mountDocRef.current === null) mountDocRef.current = value;
  if (mountLanguageRef.current === null) mountLanguageRef.current = language;
  if (mountReadOnlyRef.current === null) mountReadOnlyRef.current = readOnly;

  useEffect(() => {
    const root = hostRef.current;
    if (!root) return;

    const state = EditorState.create({
      doc: mountDocRef.current ?? "",
      extensions: [
        basicSetup,
        heightTheme,
        readOnlyConf.current.of(
          EditorState.readOnly.of(mountReadOnlyRef.current ?? false),
        ),
        languageConf.current.of(
          languageSupport(mountLanguageRef.current ?? "plaintext"),
        ),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return;
          if (update.transactions.some((tr) => tr.annotation(externalSync))) return;
          onChangeRef.current(update.state.doc.toString());
        }),
      ],
    });

    const view = new EditorView({ state, parent: root });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: languageConf.current.reconfigure(languageSupport(language)),
    });
  }, [language]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: readOnlyConf.current.reconfigure(EditorState.readOnly.of(readOnly)),
    });
  }, [readOnly]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;

    const oldLen = view.state.doc.length;
    const changeSet = ChangeSet.of(
      { from: 0, to: oldLen, insert: value },
      oldLen,
    );
    let selection = view.state.selection.map(changeSet);
    const len = value.length;
    const ranges = selection.ranges.map((r) => {
      const from = Math.max(0, Math.min(r.from, len));
      const to = Math.max(0, Math.min(r.to, len));
      if (from <= to) return EditorSelection.range(from, to);
      return EditorSelection.cursor(Math.min(from, len));
    });
    selection =
      ranges.length > 0
        ? EditorSelection.create(
            ranges,
            Math.min(selection.mainIndex, ranges.length - 1),
          )
        : EditorSelection.single(len);

    view.dispatch({
      changes: changeSet,
      selection,
      annotations: externalSync.of(true),
    });
  }, [value]);

  return <div ref={hostRef} className="h-full min-h-0 overflow-hidden" />;
}
