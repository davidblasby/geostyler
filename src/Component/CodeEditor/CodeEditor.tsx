/* Released under the BSD 2-Clause License
 *
 * Copyright © 2018-present, terrestris GmbH & Co. KG and GeoStyler contributors
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * * Redistributions of source code must retain the above copyright notice,
 *   this list of conditions and the following disclaimer.
 *
 * * Redistributions in binary form must reproduce the above copyright notice,
 *   this list of conditions and the following disclaimer in the documentation
 *   and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 */

import  React, { useCallback, useEffect, useState } from 'react';

import Editor, { useMonaco } from '@monaco-editor/react';

import 'blob';
import {
  saveAs
} from 'file-saver';

import './CodeEditor.less';

import {
  Button,
  message,
  Select
} from 'antd';
const Option = Select.Option;

import {
  Style as GsStyle,
  StyleParser
} from 'geostyler-style';

import schema from 'geostyler-style/schema.json';

import _isEqual from 'lodash/isEqual';

import { localize } from '../LocaleWrapper/LocaleWrapper';
import en_US from '../../locale/en_US';
import SldStyleParser from 'geostyler-sld-parser';
import { SLDUnitsSelect } from '../Symbolizer/SLDUnitsSelect/SLDUnitsSelect';
import { usePrevious } from '../../hook/UsePrevious';

// i18n
export interface CodeEditorLocale {
  downloadButtonLabel: string;
  formatSelectLabel: string;
  copyButtonLabel: string;
  styleCopied: string;
}

// non default props
export interface CodeEditorProps {
  /** Locale object containing translated text snippets */
  locale?: CodeEditorLocale;
  /** Delay in ms until onStyleChange will be called */
  delay?: number;
  /** Show save button */
  showSaveButton?: boolean;
  /** show copy button */
  showCopyButton?: boolean;
  /** GeoStyler Style Object to display */
  style?: GsStyle;
  /** List of StylerParsers to parse from/to */
  parsers?: StyleParser[];
  /** Default parser */
  defaultParser?: StyleParser;
  /** The callback method that is triggered when the state changes */
  onStyleChange?: (rule: GsStyle) => void;
}

const MODELPATH = 'geostyler.json';  // associate with our model
const SCHEMAURI = schema.$id;

export const COMPONENTNAME = 'CodeEditor';

export const CodeEditor: React.FC<CodeEditorProps> = ({
  defaultParser,
  delay = 500,
  locale = en_US.GsCodeEditor,
  onStyleChange = () => undefined,
  parsers = [],
  showCopyButton = false,
  showSaveButton = false,
  style
}) => {

  let editTimeout: number;

  const [activeParser, setActiveParser] = useState<StyleParser>(defaultParser);
  const [isSldParser, setIsSldParser] = useState<boolean>(false);
  const [value, setValue] = useState<string>('');
  const [invalidMessage, setInvalidMessage] = useState<string>('');
  const [hasError, setHasError] = useState<boolean>(false);
  const previousStyle = usePrevious(style);
  const previouseParser = usePrevious(activeParser);
  const monaco = useMonaco();

  useEffect(() => {
    if (monaco) {
      monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
        validate: true,
        schemas: [{
          uri: SCHEMAURI,
          fileMatch: [MODELPATH],
          schema
        }]
      });
    }
  }, [monaco]);

  const updateValueFromStyle = useCallback((s: GsStyle) => {
    setHasError(false);
    (new Promise(async () => {
      if (activeParser) {
        const {
          output: parsedStyle,
          errors
        } = await activeParser.writeStyle(s);
        if (errors?.length > 0) {
          setHasError(true);
        } else {
          setValue(parsedStyle);
        }

      } else {
        setValue(JSON.stringify(s, null, 2));
      }
    })).catch(() => setHasError(true));
  }, [activeParser]);

  useEffect(() => {
    if (!_isEqual(previousStyle, style) || !_isEqual(previouseParser, activeParser) ) {
      updateValueFromStyle(style);
    }
  }, [activeParser, style, updateValueFromStyle, previousStyle, previouseParser]);

  useEffect(() => {
    setIsSldParser(activeParser?.title.includes('SLD'));
  }, [activeParser]);

  if (hasError) {
    return (<h1>An error occured in the CodeEditor UI.</h1>);
  }

  const onChange = async (v: string) => {
    setValue(v);
    setInvalidMessage(undefined);
    try {
      let parsedStyle;
      if (activeParser) {
        const { output, errors = [] } = await activeParser.readStyle(v);
        if (errors.length > 0) {
          setInvalidMessage(errors.map(e => e.message).join(', '));
        } else {
          parsedStyle = output;
        }
      } else {
        parsedStyle = JSON.parse(v);
      }
      onStyleChange(parsedStyle);
    } catch (err) {
      setInvalidMessage(err.message);
    }
  };

  const onParserSelect = (selection: string) => {
    const parser = parsers.find((p: any) => p.title === selection);
    setActiveParser(parser);
  };

  const onUnitSelect = (selection: string) => {
    if (activeParser) {
      const parser = activeParser as SldStyleParser;
      parser.symbolizerUnits = selection;
      updateValueFromStyle(style);
    }
  };

  const handleOnChange = (v?: string) => {
    clearTimeout(editTimeout);
    editTimeout = window.setTimeout(
      () => {
        onChange(v);
      },
      delay
    );
  };

  let parserOptions = [
    <Option key="GeoStyler Style" value="GeoStyler Style" >Geostyler Style</Option>
  ];
  const additionalOptions = parsers.map((parser: any) => {
    const title = parser.title;
    return <Option key={title} value={title}>{title}</Option>;
  });
  parserOptions = [...parserOptions, ...additionalOptions];

  const onDownloadButtonClick = () => {
    if (style) {
      let fileName = style.name;
      let type = 'application/json;charset=utf-8';
      if (isSldParser) {
        type = 'text/xml;charset=utf-8';
        fileName += '.sld';
      }
      const blob = new Blob([value], {type});
      saveAs(blob, fileName);
    }
  };

  const onCopyButtonClick = () => {
    copyToClipboard(value);
  };

  /**
   * Copies the a value to the clipboard.
   * Credits: https://hackernoon.com/copying-text-to-clipboard-with-javascript-df4d4988697f
   *
   * @param {string} str The string to copy to the clipboard.
   */
  const copyToClipboard = (str: string) => {
    const el = document.createElement('textarea');
    el.value = str;
    el.setAttribute('readonly', '');
    el.style.position = 'absolute';
    el.style.left = '-9999px';
    document.body.appendChild(el);
    const selected = document.getSelection().rangeCount > 0 ? document.getSelection().getRangeAt(0) : false;
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    message.info(locale.styleCopied);
    if (selected) {
      document.getSelection().removeAllRanges();
      document.getSelection().addRange(selected);
    }
  };

  const parserHasUnitSelect = isSldParser && activeParser && (activeParser as SldStyleParser).sldVersion !== '1.0.0';

  return (
    <div className="gs-code-editor">
      <div className="gs-code-editor-toolbar" >
        {locale.formatSelectLabel}: <Select
          className="gs-code-editor-format-select"
          onSelect={onParserSelect}
          value={activeParser ? activeParser.title : 'GeoStyler Style'}
        >
          {parserOptions}
        </Select>
        {
          parserHasUnitSelect &&
            <SLDUnitsSelect changeHandler={onUnitSelect}/>
        }
      </div>
      <Editor
        className="gs-code-editor-monaco"
        value={value}
        path={isSldParser ? undefined : MODELPATH}
        language={isSldParser ? 'xml' : 'json'}
        onChange={handleOnChange}
      />
      <div className="gs-code-editor-errormessage">
        {invalidMessage}
      </div>
      <div className="gs-code-editor-bottombar">
        {
          showCopyButton &&
            <Button
              className="gs-code-editor-copy-button"
              type="primary"
              onClick={onCopyButtonClick}
            >
              {locale.copyButtonLabel}
            </Button>
        }
        {
          showSaveButton &&
            <Button
              className="gs-code-editor-download-button"
              type="primary"
              onClick={onDownloadButtonClick}
            >
              {locale.downloadButtonLabel}
            </Button>
        }
      </div>
    </div>
  );
};

export default localize(CodeEditor, COMPONENTNAME);
