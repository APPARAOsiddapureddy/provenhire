import * as faceapi from 'face-api.js';

let modelsLoaded = false;

// Load face-api models from CDN
export const loadFaceDetectionModels = async (): Promise<boolean> => {
  if (modelsLoaded) return true;
  
  try {
    const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model';
    
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
    
    modelsLoaded = true;
    console.log('Face detection models loaded successfully');
    return true;
  } catch (error) {
    console.error('Failed to load face detection models:', error);
    return false;
  }
};

// Detect faces in a video element
export const detectFaces = async (
  video: HTMLVideoElement
): Promise<faceapi.WithFaceDescriptor<faceapi.WithFaceLandmarks<{ detection: faceapi.FaceDetection }, faceapi.FaceLandmarks68>>[]> => {
  if (!modelsLoaded) {
    console.warn('Face detection models not loaded');
    return [];
  }
  
  try {
    const detections = await faceapi
      .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks(true)
      .withFaceDescriptors();
    
    return detections;
  } catch (error) {
    console.error('Face detection error:', error);
    return [];
  }
};

// Compare two face descriptors
export const compareFaces = (
  descriptor1: Float32Array,
  descriptor2: Float32Array,
  threshold: number = 0.6
): { match: boolean; distance: number } => {
  const distance = faceapi.euclideanDistance(descriptor1, descriptor2);
  return {
    match: distance < threshold,
    distance,
  };
};

// Get face descriptor from video
export const getFaceDescriptor = async (
  video: HTMLVideoElement
): Promise<Float32Array | null> => {
  const detections = await detectFaces(video);
  
  if (detections.length === 0) {
    return null;
  }
  
  // Return the descriptor of the largest face (closest to camera)
  const largestFace = detections.reduce((prev, curr) => {
    const prevArea = prev.detection.box.width * prev.detection.box.height;
    const currArea = curr.detection.box.width * curr.detection.box.height;
    return currArea > prevArea ? curr : prev;
  });
  
  return largestFace.descriptor;
};

export interface FaceVerificationResult {
  faceDetected: boolean;
  multipleFaces: boolean;
  faceCount: number;
  matchesBaseline: boolean | null;
  confidence: number | null;
  message: string;
}

// Verify face against baseline
export const verifyFace = async (
  video: HTMLVideoElement,
  baselineDescriptor: Float32Array | null
): Promise<FaceVerificationResult> => {
  const detections = await detectFaces(video);
  
  if (detections.length === 0) {
    return {
      faceDetected: false,
      multipleFaces: false,
      faceCount: 0,
      matchesBaseline: null,
      confidence: null,
      message: 'No face detected',
    };
  }
  
  if (detections.length > 1) {
    return {
      faceDetected: true,
      multipleFaces: true,
      faceCount: detections.length,
      matchesBaseline: false,
      confidence: null,
      message: `Multiple faces detected (${detections.length})`,
    };
  }
  
  const currentDescriptor = detections[0].descriptor;
  
  if (!baselineDescriptor) {
    return {
      faceDetected: true,
      multipleFaces: false,
      faceCount: 1,
      matchesBaseline: null,
      confidence: null,
      message: 'Face detected, no baseline to compare',
    };
  }
  
  const { match, distance } = compareFaces(currentDescriptor, baselineDescriptor);
  const confidence = Math.max(0, Math.min(100, (1 - distance) * 100));
  
  return {
    faceDetected: true,
    multipleFaces: false,
    faceCount: 1,
    matchesBaseline: match,
    confidence,
    message: match ? 'Face verified' : 'Face does not match baseline',
  };
};
