import { ChangeEvent, useEffect, useRef, useState } from 'react';
import {
  Camera,
  FileText,
  Loader2,
  RotateCcw,
  ScanText,
  Upload,
  Video,
} from 'lucide-react';
import ReactCrop, { Crop, convertToPixelCrop } from 'react-image-crop';
import Tesseract from 'tesseract.js';
import 'react-image-crop/dist/ReactCrop.css';
import './App.css';

const initialCrop: Crop = {
  unit: '%',
  x: 10,
  y: 10,
  width: 50,
  height: 45,
};

function App() {
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [videoName, setVideoName] = useState<string>('');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>(initialCrop);
  const [ocrText, setOcrText] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isVideoReady, setIsVideoReady] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  const handleVideoUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
    }

    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;

    setVideoSrc(url);
    setVideoName(file.name);
    setCapturedImage(null);
    setOcrText('');
    setErrorMessage('');
    setIsVideoReady(false);
    setProgress(0);
    setCrop(initialCrop);
  };

  const captureFrame = () => {
    if (!videoRef.current || !isVideoReady) {
      setErrorMessage('영상을 먼저 불러온 뒤 캡처해 주세요.');
      return;
    }

    const videoElement = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;

    const context = canvas.getContext('2d');
    if (!context) {
      setErrorMessage('캔버스를 생성할 수 없어 현재 프레임을 캡처하지 못했습니다.');
      return;
    }

    context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    setCapturedImage(canvas.toDataURL('image/png'));
    setOcrText('');
    setErrorMessage('');
    setProgress(0);
    setCrop(initialCrop);
  };

  const getCroppedImage = (imageElement: HTMLImageElement, selectedCrop: Crop) => {
    const pixelCrop = convertToPixelCrop(
      selectedCrop,
      imageElement.width,
      imageElement.height,
    );

    if (pixelCrop.width <= 0 || pixelCrop.height <= 0) {
      return null;
    }

    const scaleX = imageElement.naturalWidth / imageElement.width;
    const scaleY = imageElement.naturalHeight / imageElement.height;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(pixelCrop.width * scaleX);
    canvas.height = Math.round(pixelCrop.height * scaleY);

    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }

    context.imageSmoothingQuality = 'high';
    context.drawImage(
      imageElement,
      pixelCrop.x * scaleX,
      pixelCrop.y * scaleY,
      pixelCrop.width * scaleX,
      pixelCrop.height * scaleY,
      0,
      0,
      canvas.width,
      canvas.height,
    );

    return canvas.toDataURL('image/png');
  };

  const runOCR = async () => {
    if (!imageRef.current) {
      return;
    }

    const croppedImageUrl = getCroppedImage(imageRef.current, crop);
    if (!croppedImageUrl) {
      setErrorMessage('텍스트를 인식할 영역을 먼저 선택해 주세요.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage('');
    setOcrText('');
    setProgress(0);

    try {
      const result = await Tesseract.recognize(croppedImageUrl, 'kor+eng', {
        logger: (message) => {
          if (typeof message.progress === 'number') {
            setProgress(Math.round(message.progress * 100));
          }
        },
      });

      setOcrText(result.data.text.trim() || '인식된 텍스트가 없습니다.');
    } catch (error) {
      console.error('OCR failed:', error);
      setErrorMessage('텍스트 인식 중 오류가 발생했습니다. 영역을 다시 선택해 주세요.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleResetCapture = () => {
    setCapturedImage(null);
    setOcrText('');
    setErrorMessage('');
    setProgress(0);
    setCrop(initialCrop);
  };

  return (
    <main className="app-shell">
      <section className="workspace">
        <header className="page-header">
          <div>
            <p className="eyebrow">Browser-based OCR workflow</p>
            <h1>Video OCR Extractor</h1>
          </div>
          <label className="upload-button" htmlFor="video-upload">
            <Upload aria-hidden="true" size={18} />
            동영상 선택
            <input
              id="video-upload"
              type="file"
              accept="video/*"
              onChange={handleVideoUpload}
            />
          </label>
        </header>

        <div className="status-strip" aria-live="polite">
          <div className={videoSrc ? 'step is-complete' : 'step'}>
            <Video aria-hidden="true" size={18} />
            업로드
          </div>
          <div className={capturedImage ? 'step is-complete' : 'step'}>
            <Camera aria-hidden="true" size={18} />
            프레임 캡처
          </div>
          <div className={ocrText ? 'step is-complete' : 'step'}>
            <ScanText aria-hidden="true" size={18} />
            영역 OCR
          </div>
        </div>

        {errorMessage && <p className="error-message">{errorMessage}</p>}

        {!videoSrc && (
          <section className="empty-state">
            <Upload aria-hidden="true" size={32} />
            <h2>동영상을 업로드하면 바로 시작됩니다</h2>
            <p>재생바로 원하는 시점을 찾고, 멈춘 화면을 캡처한 뒤 텍스트 영역을 지정하세요.</p>
          </section>
        )}

        {videoSrc && !capturedImage && (
          <section className="tool-surface">
            <div className="surface-header">
              <div>
                <p className="section-label">1단계</p>
                <h2>원하는 구간에서 영상을 멈추고 캡처</h2>
              </div>
              {videoName && <span className="file-name">{videoName}</span>}
            </div>

            <video
              ref={videoRef}
              src={videoSrc}
              controls
              className="video-player"
              onLoadedMetadata={() => setIsVideoReady(true)}
            />

            <div className="action-row">
              <button
                className="primary-button"
                type="button"
                onClick={captureFrame}
                disabled={!isVideoReady}
              >
                <Camera aria-hidden="true" size={18} />
                현재 프레임 캡처
              </button>
            </div>
          </section>
        )}

        {capturedImage && (
          <section className="tool-surface">
            <div className="surface-header">
              <div>
                <p className="section-label">2단계</p>
                <h2>텍스트 영역을 드래그해서 선택</h2>
              </div>
              <div className="button-group">
                <button className="ghost-button" type="button" onClick={handleResetCapture}>
                  <RotateCcw aria-hidden="true" size={18} />
                  다시 캡처
                </button>
                <button
                  className="primary-button"
                  type="button"
                  onClick={runOCR}
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <Loader2 aria-hidden="true" className="spin" size={18} />
                  ) : (
                    <ScanText aria-hidden="true" size={18} />
                  )}
                  {isProcessing ? `분석 중 ${progress}%` : '선택 영역 OCR'}
                </button>
              </div>
            </div>

            <div className="crop-stage">
              <ReactCrop
                crop={crop}
                onChange={(_, percentCrop) => setCrop(percentCrop)}
                keepSelection
              >
                <img ref={imageRef} src={capturedImage} alt="캡처된 비디오 프레임" />
              </ReactCrop>
            </div>
          </section>
        )}

        {ocrText && (
          <section className="result-panel" aria-live="polite">
            <div className="result-title">
              <FileText aria-hidden="true" size={20} />
              <h2>인식 결과</h2>
            </div>
            <p>{ocrText}</p>
          </section>
        )}
      </section>
    </main>
  );
}

export default App;
