import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle, AlertCircle, FileWarning } from "lucide-react";
import JSZip from "jszip";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const App = () => {
  const [zipFiles, setZipFiles] = useState([]);
  const [rawZipFiles, setRawZipFiles] = useState([]);
  const [expectedFiles, setExpectedFiles] = useState([]);
  const [includeTopDir, setIncludeTopDir] = useState(false);
  const [comparison, setComparison] = useState({
    missing: [],
    extra: [],
  });
  const [ngFiles, setNgFiles] = useState(['/docs/index.html', '*.scss', '*.css.map']);
  const [ngFilesInZip, setNgFilesInZip] = useState([]);
  const [ngFilesInList, setNgFilesInList] = useState([]);
  const [isEditingNgFiles, setIsEditingNgFiles] = useState(false);

  useEffect(() => {
    const fetchNgFiles = async () => {
      try {
        const { data, error } = await supabase
          .from('ng_list')
          .select('file_list')
          .eq('id', 1)
          .single();

        if (error) {
          throw error;
        }

        const files = data.file_list.split("\n").map((line) => line.trim()).filter(Boolean);
        setNgFiles(files);
        checkForNgFiles(zipFiles, expectedFiles, files);
      } catch (error) {
        console.error("Error fetching NG files from Supabase:", error);
      }
    };

    fetchNgFiles();
  }, []);

  // ZIPファイルからトップディレクトリを検出
  const detectTopDirectory = (fileList) => {
    if (fileList.length === 0) return "";
    const firstPath = fileList[0];
    const firstDir = firstPath.split("/")[1];

    const hasCommonTopDir = fileList.every(
      (path) => path.split("/")[1] === firstDir,
    );
    return hasCommonTopDir ? firstDir : "";
  };

  // パスからトップディレクトリを除去
  const removeTopDirectory = (path, topDir) => {
    if (!topDir) return path;
    const regex = new RegExp(`^/${topDir}`);
    return path.replace(regex, "");
  };

  // ZIPファイル処理
  const handleZipUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const zip = new JSZip();
      const contents = await zip.loadAsync(file);
      const fileList = Object.keys(contents.files)
        .filter((name) => !contents.files[name].dir)
        .map((name) => "/" + name);

      setRawZipFiles(fileList);
      processZipFiles(fileList, includeTopDir);
    } catch (error) {
      console.error("Error processing ZIP file:", error);
      alert("Error occurred while processing ZIP file");
    }
  };

  // トップディレクトリの処理を含むZIPファイルの処理
  const processZipFiles = (fileList, shouldIncludeTopDir) => {
    const topDir = detectTopDirectory(fileList);
    const processedFiles = shouldIncludeTopDir
      ? fileList
      : fileList.map((path) => removeTopDirectory(path, topDir));

    setZipFiles(processedFiles);
    compareFiles(processedFiles, expectedFiles);
  };

  // トップディレクトリ含むかどうかの切り替え
  const handleToggleTopDir = (checked) => {
    setIncludeTopDir(checked);
    processZipFiles(rawZipFiles, checked);
  };

  // テキストファイル処理
  const handleFileListUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const files = text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      setExpectedFiles(files);
      compareFiles(zipFiles, files);
    } catch (error) {
      console.error("Error processing text file:", error);
      alert("Error occurred while processing text file");
    }
  };

  // テキストエリア入力処理
  const handleTextAreaChange = (e) => {
    const files = e.target.value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    setExpectedFiles(files);
    compareFiles(zipFiles, files);
  };

  // NGファイル入力処理
  const handleNgFilesChange = (e) => {
    const files = e.target.value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    setNgFiles(files);
    checkForNgFiles(zipFiles, expectedFiles, files);
  };

  const handleTextAreaKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const { selectionStart, selectionEnd, value } = e.target;
      const newValue = value.substring(0, selectionStart) + '\n' + value.substring(selectionEnd);
      e.target.value = newValue;
      e.target.selectionStart = e.target.selectionEnd = selectionStart + 1;
      e.target.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };

  // ファイル比較
  const compareFiles = (actual, expected) => {
    const normalizeList = (list) => {
      return list.map((path) => path.replace(/\/$/, ""));
    };

    const normalizedActual = normalizeList(actual);
    const normalizedExpected = normalizeList(expected);

    const missing = normalizedExpected.filter(
      (file) => !normalizedActual.includes(file),
    );
    const extra = normalizedActual.filter(
      (file) => !normalizedExpected.includes(file),
    );
    setComparison({ missing, extra });

    checkForNgFiles(actual, expected, ngFiles);
  };

  const checkForNgFiles = (zipFiles, expectedFiles, ngFiles) => {
    const ngFilePatterns = ngFiles.map((file) => new RegExp(file.replace('*', '.*')));
    const inZip = zipFiles.filter((file) => ngFilePatterns.some((pattern) => pattern.test(file)));
    const inList = expectedFiles.filter((file) => ngFilePatterns.some((pattern) => pattern.test(file)));
    setNgFilesInZip(inZip);
    setNgFilesInList(inList);
  };

  const handleEditNgFiles = () => {
    setIsEditingNgFiles(true);
  };

  const handleSaveNgFiles = async () => {
    try {
      const { error } = await supabase
        .from('ng_list')
        .update({ file_list: ngFiles.join("\n") })
        .eq('id', 1);

      if (error) {
        throw error;
      }

      setIsEditingNgFiles(false);
    } catch (error) {
      console.error("Error updating NG files in Supabase:", error);
    }
  };

  return (
    <div className="container max-w-4xl mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">
        ファイル比較ツール
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>ZIPファイル</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="w-full max-w-sm items-center gap-1.5">
            <Label htmlFor="zip-upload" className="h-full inline-block hover:opacity-70">
              <Button className="pointer-events-none">ファイルを選択</Button>
            </Label>
            <input
              id="zip-upload"
              type="file"
              accept=".zip"
              onChange={handleZipUpload}
              className="hidden"
            />
          </div>

          {zipFiles.length > 0 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">
                ZIP内のファイル数: {zipFiles.length}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ファイルリスト</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="w-full max-w-sm items-center gap-1.5">
              <Label htmlFor="file-list-upload" className="h-full inline-block hover:opacity-70">
                <Button className="pointer-events-none">ファイルを選択</Button>
              </Label>
              <input
                id="file-list-upload"
                type="file"
                accept=".txt"
                onChange={handleFileListUpload}
                className="hidden"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="manual-input">手動で入力する場合はこちら</Label>
              <Textarea
                id="manual-input"
                placeholder="/docs/example/index.html&#10;/docs/example/css/style.css&#10;/docs/example/img/image.png"
                value={expectedFiles.join("\n")}
                onChange={handleTextAreaChange}
                onKeyDown={handleTextAreaKeyDown}
                className="font-mono min-h-[200px]"
              />
            </div>
          </div>
          {expectedFiles.length > 0 && (
            <p className="text-sm text-gray-500">
              ファイルリスト内のファイル数: {expectedFiles.length}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>NGファイル</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ng-input" className="cursor-default">NGファイルを変更するには編集ボタンをクリックしてください</Label>
              <Textarea
                id="ng-input"
                placeholder="/docs/example/index.html&#10;/docs/example/css/style.css&#10;/docs/example/img/image.png"
                value={ngFiles.join("\n")}
                onChange={handleNgFilesChange}
                onKeyDown={handleTextAreaKeyDown}
                className="font-mono min-h-[200px]"
                disabled={!isEditingNgFiles}
              />
            </div>
            <div className="flex space-x-2">
              <Button onClick={handleEditNgFiles} disabled={isEditingNgFiles}>編集</Button>
              <Button onClick={handleSaveNgFiles} disabled={!isEditingNgFiles}>保存</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>オプション</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2">
            <Switch
              id="include-top-dir"
              checked={includeTopDir}
              onCheckedChange={handleToggleTopDir}
            />
            <Label htmlFor="include-top-dir">トップのディレクトリを含める</Label>
          </div>
        </CardContent>
      </Card>

      {(comparison.missing.length > 0 ||
        comparison.extra.length > 0 ||
        (zipFiles.length > 0 && expectedFiles.length > 0)) && (
        <Card>
          <CardHeader>
            <CardTitle>比較結果</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {(ngFilesInZip.length > 0 || ngFilesInList.length > 0) && (
              <div className="space-y-4">
                {ngFilesInZip.length > 0 && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>ZIPファイルに含まれているNGファイル</AlertTitle>
                    <AlertDescription>
                      <ul className="mt-2 space-y-1 font-mono text-sm">
                        {ngFilesInZip.map((file) => (
                          <li key={file}>{file}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}
                {ngFilesInList.length > 0 && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>ファイルリストに含まれているNGファイル</AlertTitle>
                    <AlertDescription>
                      <ul className="mt-2 space-y-1 font-mono text-sm">
                        {ngFilesInList.map((file) => (
                          <li key={file}>{file}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}
            {comparison.missing.length === 0 &&
            comparison.extra.length === 0 &&
            zipFiles.length > 0 &&
            expectedFiles.length > 0 ? (
              <Alert variant="default" className="bg-green-50 border-green-200">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertTitle className="text-green-800">ZIP内のファイルとファイルリストが一致しました</AlertTitle>
              </Alert>
            ) : (
              <>
                {comparison.missing.length > 0 && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>リストに記載されているがZIP内に存在しないファイル</AlertTitle>
                    <AlertDescription>
                      <ul className="mt-2 space-y-1 font-mono text-sm">
                        {comparison.missing.map((file) => (
                          <li key={file}>{file}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}
                {comparison.extra.length > 0 && (
                  <Alert variant="warning" className="bg-orange-50 border-orange-200">
                    <FileWarning className="h-4 w-4 text-orange-600" />
                    <AlertTitle className="text-orange-800">ZIPに含まれているがリストに記載が無いファイル</AlertTitle>
                    <AlertDescription>
                      <ul className="mt-2 space-y-1 font-mono text-sm text-orange-700">
                        {comparison.extra.map((file) => (
                          <li key={file}>{file}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default App;