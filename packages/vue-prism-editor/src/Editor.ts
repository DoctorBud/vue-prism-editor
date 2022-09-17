/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable */

import { defineComponent, h } from 'vue';

import './styles.css';
const KEYCODE_ENTER = 13;
const KEYCODE_TAB = 9;
const KEYCODE_BACKSPACE = 8;
const KEYCODE_Y = 89;
const KEYCODE_Z = 90;
const KEYCODE_M = 77;
const KEYCODE_PARENS = 57;
const KEYCODE_BRACKETS = 219;
const KEYCODE_QUOTE = 222;
const KEYCODE_BACK_QUOTE = 192;
const KEYCODE_ESCAPE = 27;

const HISTORY_LIMIT = 100;
const HISTORY_TIME_GAP = 3000;

const isWindows = typeof window !== 'undefined' && navigator && /Win/i.test(navigator.platform);
const isMacLike = typeof window !== 'undefined' && navigator && /(Mac|iPhone|iPod|iPad)/i.test(navigator.platform);

export interface EditorProps {
  lineNumbers: boolean;
  autoStyleLineNumbers: boolean;
  readonly: boolean;
  value: string;
  highlight: () => string;
  tabSize: number;
  insertSpaces: boolean;
  ignoreTabKey: boolean;
  placeholder: string;
  wordWrap: boolean;
}
export interface Record {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

export interface History {
  stack: Array<Record & { timestamp: number }>;
  offset: number;
}

export const PrismEditor = defineComponent({
  props: {
    lineNumbers: {
      type: Boolean,
      default: false,
    },
    autoStyleLineNumbers: {
      type: Boolean,
      default: true,
    },
    readonly: {
      type: Boolean,
      default: false,
    },
    modelValue: {
      type: String,
      default: '',
    },
    highlight: {
      type: Function,
      required: true,
    },
    tabSize: {
      type: Number,
      default: 2,
    },
    insertSpaces: {
      type: Boolean,
      default: true,
    },
    ignoreTabKey: {
      type: Boolean,
      default: false,
    },
    placeholder: {
      type: String,
      default: '',
    },
    wordWrap: {
      type: Boolean,
      default: false,
    },
  },
  data() {
    return {
      capture: true,
      history: {
        stack: [],
        offset: -1,
      } as History,
      lineNumbersHeight: '20px',
      codeData: '',
    };
  },
  watch: {
    modelValue: {
      immediate: true,
      handler(newVal: string): void {
        if (!newVal) {
          this.codeData = '';
        } else {
          this.codeData = newVal;
        }
      },
    },
    content: {
      immediate: true,
      handler(): void {
        if (this.lineNumbers) {
          this.$nextTick(() => {
            this.setLineNumbersHeight();
          });
        }
        this.$nextTick(() => {
          if (!this.wordWrap) {
            this.updateTextareaDimensions();
          } else {
            this.updateLineNumbersMarginTop();
          }
        })
      },
    },
    lineNumbers(): void {
      this.$nextTick(() => {
        this.styleLineNumbers();
        this.setLineNumbersHeight();
      });
    },
    wordWrap(bool: boolean): void {
      if (bool) {
        const textarea = document.querySelector('.prism-editor__textarea') as HTMLTextAreaElement;

        if (textarea) {
          textarea.style.width = '100%';
          textarea.style.height = '100%';
        }

        this.$nextTick(() => {
          this.updateLineNumbersMarginTop();
        });
      } else {
        const allLineNumbers = document.querySelectorAll('.prism-editor__line-number') as NodeListOf<HTMLDivElement>;

        if (allLineNumbers) {
          allLineNumbers.forEach((e) => {
            e.style.marginTop = '0';
          });
        }
      }
    },
  },
  computed: {
    isEmpty(): boolean {
      return this.codeData.length === 0;
    },
    content(): string {
      const result = this.highlight(this.codeData) + '<br />';
      // todo: VNode support?
      return result;
    },
    lineNumbersCount(): number {
      const totalLines = this.codeData.split(/\r\n|\n/).length;
      return totalLines;
    },
  },
  mounted() {
    this._recordCurrentState();
    this.styleLineNumbers();
    if (!this.wordWrap) {
      this.updateTextareaDimensions();
    } else {
      this.updateLineNumbersMarginTop();
    }
  },

  methods: {
    setLineNumbersHeight(): void {
      this.lineNumbersHeight = getComputedStyle(this.$refs.pre as HTMLTextAreaElement).height;
    },
    styleLineNumbers(): void {
      if (!this.lineNumbers || !this.autoStyleLineNumbers) return;

      const $editor = this.$refs.pre as HTMLTextAreaElement;
      const $lineNumbers: HTMLDivElement | null = this.$el.querySelector('.prism-editor__line-numbers');
      const editorStyles = window.getComputedStyle($editor);

      this.$nextTick(() => {
        const btlr: any = 'border-top-left-radius';
        const bblr: any = 'border-bottom-left-radius';
        if (!$lineNumbers) return;
        $lineNumbers.style[btlr] = editorStyles[btlr];
        $lineNumbers.style[bblr] = editorStyles[bblr];
        $editor.style[btlr] = '0';
        $editor.style[bblr] = '0';

        const stylesList = ['background-color', 'margin-top', 'padding-top', 'font-family', 'font-size', 'line-height'];
        stylesList.forEach((style: any) => {
          $lineNumbers.style[style] = editorStyles[style];
        });
        $lineNumbers.style['margin-bottom' as any] = '-' + editorStyles['padding-top' as any];
      });
    },
    _recordCurrentState(): void {
      const input = this.$refs.textarea as HTMLTextAreaElement;

      if (!input) return;
      // Save current state of the input
      const { value, selectionStart, selectionEnd } = input;

      this._recordChange({
        value,
        selectionStart,
        selectionEnd,
      });
    },
    _getLines(text: string, position: number): Array<string> {
      return text.substring(0, position).split('\n');
    },
    _applyEdits(record: Record): void {
      // Save last selection state
      const input = this.$refs.textarea as HTMLTextAreaElement;
      const last = this.history.stack[this.history.offset];

      if (last && input) {
        this.history.stack[this.history.offset] = {
          ...last,
          selectionStart: input.selectionStart,
          selectionEnd: input.selectionEnd,
        };
      }

      // Save the changes
      this._recordChange(record);
      this._updateInput(record);
    },
    _recordChange(record: Record, overwrite = false): void {
      const { stack, offset } = this.history;

      if (stack.length && offset > -1) {
        // When something updates, drop the redo operations
        this.history.stack = stack.slice(0, offset + 1);

        // Limit the number of operations to 100
        const count = this.history.stack.length;

        if (count > HISTORY_LIMIT) {
          const extras = count - HISTORY_LIMIT;

          this.history.stack = stack.slice(extras, count);
          this.history.offset = Math.max(this.history.offset - extras, 0);
        }
      }

      const timestamp = Date.now();

      if (overwrite) {
        const last = this.history.stack[this.history.offset];

        if (last && timestamp - last.timestamp < HISTORY_TIME_GAP) {
          // A previous entry exists and was in short interval

          // Match the last word in the line
          const re = /[^a-z0-9]([a-z0-9]+)$/i;

          // Get the previous line
          const previous = this._getLines(last.value, last.selectionStart).pop()?.match(re);

          // Get the current line
          const current = this._getLines(record.value, record.selectionStart).pop()?.match(re);

          if (previous && current && current[1].startsWith(previous[1])) {
            // The last word of the previous line and current line match
            // Overwrite previous entry so that undo will remove whole word
            this.history.stack[this.history.offset] = {
              ...record,
              timestamp,
            };

            return;
          }
        }
      }

      // Add the new operation to the stack
      this.history.stack.push({ ...record, timestamp });
      this.history.offset++;
    },

    _updateInput(record: Record): void {
      const input = this.$refs.textarea as HTMLTextAreaElement;

      if (!input) return;

      // Update values and selection state
      input.value = record.value;
      input.selectionStart = record.selectionStart;
      input.selectionEnd = record.selectionEnd;

      this.$emit('update:modelValue', record.value);
      // this.props.onValueChange(record.value);
    },
    handleChange(e: KeyboardEvent): void {
      const { value, selectionStart, selectionEnd } = e.target as HTMLTextAreaElement;

      this._recordChange(
        {
          value,
          selectionStart,
          selectionEnd,
        },
        true
      );
      this.$emit('update:modelValue', value);
      // this.props.onValueChange(value);
    },
    _undoEdit(): void {
      const { stack, offset } = this.history;

      // Get the previous edit
      const record = stack[offset - 1];

      if (record) {
        // Apply the changes and update the offset
        this._updateInput(record);
        this.history.offset = Math.max(offset - 1, 0);
      }
    },
    _redoEdit(): void {
      const { stack, offset } = this.history;

      // Get the next edit
      const record = stack[offset + 1];

      if (record) {
        // Apply the changes and update the offset
        this._updateInput(record);
        this.history.offset = Math.min(offset + 1, stack.length - 1);
      }
    },
    handleKeyDown(e: KeyboardEvent): void {
      // console.log(navigator.platform);
      const { tabSize, insertSpaces, ignoreTabKey } = this;

      // onKeyDown(e);
      this.$emit('keydown', e);

      if (e.defaultPrevented) {
        return;
      }

      if (e.keyCode === KEYCODE_ESCAPE) {
        (<HTMLTextAreaElement>e.target).blur();
        this.$emit('blur', e);
      }

      const { value, selectionStart, selectionEnd } = e.target as HTMLTextAreaElement;

      const tabCharacter = (insertSpaces ? ' ' : '\t').repeat(tabSize);

      if (e.keyCode === KEYCODE_TAB && !ignoreTabKey && this.capture) {
        // Prevent focus change
        e.preventDefault();

        if (e.shiftKey) {
          // Unindent selected lines
          const linesBeforeCaret = this._getLines(value, selectionStart);
          const startLine = linesBeforeCaret.length - 1;
          const endLine = this._getLines(value, selectionEnd).length - 1;
          const nextValue = value
            .split('\n')
            .map((line, i) => {
              if (i >= startLine && i <= endLine && line.startsWith(tabCharacter)) {
                return line.substring(tabCharacter.length);
              }

              return line;
            })
            .join('\n');

          if (value !== nextValue) {
            const startLineText = linesBeforeCaret[startLine];

            this._applyEdits({
              value: nextValue,
              // Move the start cursor if first line in selection was modified
              // It was modified only if it started with a tab
              selectionStart: startLineText.startsWith(tabCharacter)
                ? selectionStart - tabCharacter.length
                : selectionStart,
              // Move the end cursor by total number of characters removed
              selectionEnd: selectionEnd - (value.length - nextValue.length),
            });
          }
        } else if (selectionStart !== selectionEnd) {
          // Indent selected lines
          const linesBeforeCaret = this._getLines(value, selectionStart);
          const startLine = linesBeforeCaret.length - 1;
          const endLine = this._getLines(value, selectionEnd).length - 1;
          const startLineText = linesBeforeCaret[startLine];

          this._applyEdits({
            value: value
              .split('\n')
              .map((line, i) => {
                if (i >= startLine && i <= endLine) {
                  return tabCharacter + line;
                }

                return line;
              })
              .join('\n'),
            // Move the start cursor by number of characters added in first line of selection
            // Don't move it if it there was no text before cursor
            selectionStart: /\S/.test(startLineText) ? selectionStart + tabCharacter.length : selectionStart,
            // Move the end cursor by total number of characters added
            selectionEnd: selectionEnd + tabCharacter.length * (endLine - startLine + 1),
          });
        } else {
          const updatedSelection = selectionStart + tabCharacter.length;

          this._applyEdits({
            // Insert tab character at caret
            value: value.substring(0, selectionStart) + tabCharacter + value.substring(selectionEnd),
            // Update caret position
            selectionStart: updatedSelection,
            selectionEnd: updatedSelection,
          });
        }
      } else if (e.keyCode === KEYCODE_BACKSPACE) {
        const hasSelection = selectionStart !== selectionEnd;
        const textBeforeCaret = value.substring(0, selectionStart);

        if (textBeforeCaret.endsWith(tabCharacter) && !hasSelection) {
          // Prevent default delete behaviour
          e.preventDefault();

          const updatedSelection = selectionStart - tabCharacter.length;

          this._applyEdits({
            // Remove tab character at caret
            value: value.substring(0, selectionStart - tabCharacter.length) + value.substring(selectionEnd),
            // Update caret position
            selectionStart: updatedSelection,
            selectionEnd: updatedSelection,
          });
        }
      } else if (e.keyCode === KEYCODE_ENTER) {
        // Ignore selections
        if (selectionStart === selectionEnd) {
          // Get the current line
          const line = this._getLines(value, selectionStart).pop();
          const matches = line?.match(/^\s+/);

          if (matches && matches[0]) {
            e.preventDefault();

            // Preserve indentation on inserting a new line
            const indent = '\n' + matches[0];
            const updatedSelection = selectionStart + indent.length;

            this._applyEdits({
              // Insert indentation character at caret
              value: value.substring(0, selectionStart) + indent + value.substring(selectionEnd),
              // Update caret position
              selectionStart: updatedSelection,
              selectionEnd: updatedSelection,
            });
          }
        }
      } else if (
        e.keyCode === KEYCODE_PARENS ||
        e.keyCode === KEYCODE_BRACKETS ||
        e.keyCode === KEYCODE_QUOTE ||
        e.keyCode === KEYCODE_BACK_QUOTE
      ) {
        let chars;

        if (e.keyCode === KEYCODE_PARENS && e.shiftKey) {
          chars = ['(', ')'];
        } else if (e.keyCode === KEYCODE_BRACKETS) {
          if (e.shiftKey) {
            chars = ['{', '}'];
          } else {
            chars = ['[', ']'];
          }
        } else if (e.keyCode === KEYCODE_QUOTE) {
          if (e.shiftKey) {
            chars = ['"', '"'];
          } else {
            chars = ["'", "'"];
          }
        } else if (e.keyCode === KEYCODE_BACK_QUOTE && !e.shiftKey) {
          chars = ['`', '`'];
        }

        // console.log(isMacLike, "navigator" in global && /(Mac|iPhone|iPod|iPad)/i.test(navigator.platform));

        // If text is selected, wrap them in the characters
        if (selectionStart !== selectionEnd && chars) {
          e.preventDefault();

          this._applyEdits({
            value:
              value.substring(0, selectionStart) +
              chars[0] +
              value.substring(selectionStart, selectionEnd) +
              chars[1] +
              value.substring(selectionEnd),
            // Update caret position
            selectionStart,
            selectionEnd: selectionEnd + 2,
          });
        }
      } else if (
        (isMacLike
          ? // Trigger undo with ⌘+Z on Mac
            e.metaKey && e.keyCode === KEYCODE_Z
          : // Trigger undo with Ctrl+Z on other platforms
            e.ctrlKey && e.keyCode === KEYCODE_Z) &&
        !e.shiftKey &&
        !e.altKey
      ) {
        e.preventDefault();

        this._undoEdit();
      } else if (
        (isMacLike
          ? // Trigger redo with ⌘+Shift+Z on Mac
            e.metaKey && e.keyCode === KEYCODE_Z && e.shiftKey
          : isWindows
          ? // Trigger redo with Ctrl+Y on Windows
            e.ctrlKey && e.keyCode === KEYCODE_Y
          : // Trigger redo with Ctrl+Shift+Z on other platforms
            e.ctrlKey && e.keyCode === KEYCODE_Z && e.shiftKey) &&
        !e.altKey
      ) {
        e.preventDefault();

        this._redoEdit();
      } else if (e.keyCode === KEYCODE_M && e.ctrlKey && (isMacLike ? e.shiftKey : true)) {
        e.preventDefault();

        // Toggle capturing tab key so users can focus away
        this.capture = !this.capture;
      }
    },

    updateTextareaDimensions(): void {
      const textarea = document.querySelector('.prism-editor__textarea') as HTMLTextAreaElement;
      const pre = document.querySelector('.prism-editor__editor') as HTMLPreElement;

      if (textarea && pre) {
        const { width, height } = pre.getBoundingClientRect();

        textarea.style.width = `${width}px`;
        textarea.style.height = `${height}px`;
      }
    },

    getRowsPerLine(): number[] {
      const editor = document.querySelector('.prism-editor__editor') as HTMLElement
      const result: number[] = [];
      if (!editor) return result;

      const lineHeight = parseInt(window.getComputedStyle(editor).lineHeight, 10);

      const children = Array.from(editor.childNodes).slice(0, -1)

      const hcontainer = document.querySelector('.prism-editor__container') as HTMLElement
      const containerTop = hcontainer.offsetTop;
      const containerLeft = hcontainer.offsetLeft;
      let lastTop = containerTop;
      console.log('children', children, lineHeight, containerTop, containerLeft);

      let amend = false;

      for (const child of children) {
        if (child.nodeType === 1) {
          const hchild = child as HTMLElement;
          const thisRect = hchild.getBoundingClientRect();
          const thisTop = thisRect.top;
          const lines = Math.ceil(thisRect.height / lineHeight);
          const isTemplate = false; // hchild.classList.contains('template-string');
          const textLines = hchild.innerText.split('\n').length - 1;
          console.log('hchild', hchild, textLines, thisRect.top, thisRect.height, lines);

          if (isTemplate) {
            console.log('#element template', thisTop, lastTop, lines);

            for (let i = 0; i < lines; ++i) {
              if (thisTop === lastTop) {
                console.log('...#element template ignore', thisTop, lastTop, lines);
              } else {
                result.push(1);
                console.log('#...element template add', thisTop, lastTop, lines);
                lastTop = thisTop + lineHeight;
                // amend = false;
              }
            }
          } else {
            console.log('#element', thisTop, lastTop, lines, hchild);
            if (thisTop === lastTop) {
              if (textLines > 0) {
                for (let i = 0; i < textLines; ++i) {
                  result.push(1);
                  lastTop += lineHeight;
                }
                console.log('...#element amend1', result[result.length - 1], result.length, lines, thisTop, lastTop);
              }
              else {
                result[result.length - 1] = Math.max(result[result.length - 1], lines);
                lastTop = thisTop + (lines - 1) * lineHeight;
                console.log('...#element amend2', result[result.length - 1], result.length, lines, thisTop, lastTop);
              }
            } else if (lastTop === containerTop || thisTop > lastTop) {
              result.push(lines);
              console.log('...#element new', result[result.length - 1], result.length, lines, thisTop, lastTop);
              lastTop = thisTop + (lines - 1) * lineHeight;
            }
          }
        } else if (child.nodeName === '#text' && child.nodeValue !== null) {
          const lines = child.nodeValue.split('\n');
          const range = document.createRange()
          range.selectNode(child);
          const thisRects = range.getClientRects();
          console.log('#text', thisRects, result.length, lastTop, JSON.stringify(child.nodeValue), lines);

          for (let i = 0; i < thisRects.length; ++i) {
            const thisRect = thisRects[i];
            if (thisRect.width === 0) {
              if (thisRect.top === lastTop) {
                amend = false;
                console.log('...#text ignore1', amend, i, thisRect, thisRect.left, result[result.length - 1], result.length);
              } else {
                result.push(1);
                lastTop = thisRect.top;
                amend = false;
                console.log('...#text add empty', amend, i, thisRect, thisRect.left, result[result.length - 1], result.length);
              }
            }
            else {
              if (thisRect.top === lastTop) {
                console.log('...#text ignore2', i, thisRect, result[result.length - 1], result.length);
                amend = true;
              } else {
                if (amend) {
                  result[result.length - 1] += 1;
                  lastTop = thisRect.top;
                  console.log('...#text amend', i, thisRect, result[result.length - 1], result.length);
                } else {
                  result.push(1);
                  console.log('...#text add new', i, thisRect, result[result.length - 1], result.length);
                  lastTop = thisRect.top;
                  amend = true;
                }
              }
            }
          }
        } else {
          console.log('unknown child type', child.nodeType, child.nodeValue, child.nodeName,
              child.nodeName === '#text');
        }
      }

      console.log('getRowsPerLine', result);
      return result;
    },

    updateLineNumbersMarginTop () {
      const rowsPerLine = this.getRowsPerLine();
      const lineNumbers = document.querySelectorAll('.prism-editor__line-number')
      const lineHeight = parseInt(window.getComputedStyle(lineNumbers[0]).lineHeight, 10);

      if (lineNumbers && lineNumbers.length > 1) {
        const lineNumbersArr = Array.from(lineNumbers) as HTMLDivElement[]

        lineNumbersArr.forEach((element, index) => {
          if (index > 0) {
            const rows = rowsPerLine[index - 1];
            // console.log(`LINE: ${index + 1} ROWS BEFORE: ${rows}`)

            const finalMarginTop = (rows - 1) * lineHeight;

            if (finalMarginTop > 0) {
              element.style.marginTop = `${finalMarginTop}px`
            } else {
              element.style.marginTop = `0px`
            }

            // console.log(`LINE ${line} MARGIN TOP: ${finalMarginTop}px`)
          }
        })
      }
    },

    getIndexes(searchStr: string, str: string, caseSensitive?: boolean): number[] {
      const searchStrLen = searchStr.length;
      if (searchStrLen == 0) {
          return [];
      }
      let startIndex = 0, index, indexes = [];
      if (!caseSensitive) {
          str = str.toLowerCase();
          searchStr = searchStr.toLowerCase();
      }
      while ((index = str.indexOf(searchStr, startIndex)) > -1) {
          indexes.push(index);
          startIndex = index + searchStrLen;
      }
      return indexes;
    }
  },
  render() {
    // this.$nextTick(() => {
    //   this.getClientRects();
    // });

    const lineNumberWidthCalculator = h(
      'div',
      {
        class: 'prism-editor__line-width-calc',
        style: 'height: 0px; visibility: hidden; pointer-events: none;',
      },
      '999'
    );
    const lineNumbers = h(
      'div',
      {
        class: 'prism-editor__line-numbers',
        style: {
          'min-height': this.lineNumbersHeight,
        },
        'aria-hidden': 'true',
      },
      [
        lineNumberWidthCalculator,
        Array.from(Array(this.lineNumbersCount).keys()).map((_, index) => {
          return h('div', { class: 'prism-editor__line-number token comment' }, `${++index}`);
        }),
      ]
    );

    const textarea = h('textarea', {
      ref: 'textarea',
      onInput: this.handleChange,
      onKeydown: this.handleKeyDown,
      onClick: ($event: MouseEvent) => {
        this.$emit('click', $event);
      },
      onKeyup: ($event: KeyboardEvent) => {
        this.$emit('keyup', $event);
      },
      onFocus: ($event: FocusEvent) => {
        this.$emit('focus', $event);
      },
      onBlur: ($event: FocusEvent) => {
        this.$emit('blur', $event);
      },
      class: [
        'prism-editor__textarea',
        {'prism-editor__textarea--empty': this.isEmpty},
        {'prism-editor__texarea--word-wrap': this.wordWrap},
      ],
      spellCheck: 'false',
      autocapitalize: 'off',
      autocomplete: 'off',
      autocorrect: 'off',
      'data-gramm': 'false',
      placeholder: this.placeholder,
      'data-testid': 'textarea',
      readonly: this.readonly,
      value: this.codeData,
    });
    const preview = h('pre', {
      ref: 'pre',
      class: [
        'prism-editor__editor',
        {
          'prism-editor__editor--word-wrap': this.wordWrap,
        }
      ],
      'data-testid': 'preview',
      innerHTML: this.content,
    });
    // console.log('preview222', preview);
    const editorContainer = h('div', {
      class: [
        'prism-editor__container',
        { 'prism-editor__container--word-wrap': this.wordWrap },
      ],
    }, [textarea, preview]);
    // console.log('editorContainer', editorContainer);
    return h('div', { class: 'prism-editor-wrapper' }, [this.lineNumbers && lineNumbers, editorContainer]);
  },
});
