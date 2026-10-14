import * as React from "react"
import * as AceEditorModule from "react-ace"

import "ace-builds/src-noconflict/mode-python"
import "ace-builds/src-noconflict/snippets/python"
import "ace-builds/src-noconflict/theme-one_dark"
import "ace-builds/src-noconflict/ext-language_tools"

import { cn } from "./cn"

const AceEditor = AceEditorModule.default

interface CodeEditorProperties {
  /**
  代码内容
  */
  readonly value: string
  /**
  内容变更回调
  */
  readonly onChange?: (value: string) => void
  /**
  编程语言，默认 python
  */
  readonly language?: string
  /**
  占位符文本
  */
  readonly placeholder?: string
  /**
  编辑器高度，默认 200px
  */
  readonly height?: string
  /**
  是否只读
  */
  readonly readOnly?: boolean
  /**
  自定义类名
  */
  readonly className?: string
}

/**
 * 基于 Ace Editor 的代码编辑器组件 内置 Python 语法高亮、关键字/内置函数补全、代码片段、Tab 缩进等
 */
export const CodeEditor: React.FC<CodeEditorProperties> = ({
  value,
  onChange,
  language = "python",
  placeholder,
  height = "200px",
  readOnly = false,
  className,
}) => (
  <div className={cn("overflow-hidden rounded-md border", className)}>
    <AceEditor
      mode={language}
      theme="one_dark"
      value={value}
      onChange={onChange}
      name={`code-editor-${React.useId()}`}
      width="100%"
      height={height}
      fontSize={13}
      showGutter={true}
      showPrintMargin={false}
      highlightActiveLine={true}
      readOnly={readOnly}
      placeholder={placeholder}
      tabSize={4}
      setOptions={{
        enableBasicAutocompletion: true,
        enableLiveAutocompletion: true,
        enableSnippets: true,
        showLineNumbers: true,
        tabSize: 4,
        useSoftTabs: true,
        wrap: true,
      }}
      editorProps={{ $blockScrolling: Infinity }}
    />
  </div>
)
