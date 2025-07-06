import React, { useState, useRef, useEffect } from 'react';
import './App.css';

function App() {
  // State variables
  const [recording, setRecording] = useState(false);
  const [videoBlob, setVideoBlob] = useState(null);
  const [uploadedVideoId, setUploadedVideoId] = useState('');
  const [uploadStatus, setUploadStatus] = useState('');
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const [previousVideos, setPreviousVideos] = useState([]);
  const [isLoadingVideos, setIsLoadingVideos] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Cloudflare Stream account details from environment variables
  const customerCode = process.env.REACT_APP_CLOUDFLARE_CUSTOMER_CODE;
  const accountId = process.env.REACT_APP_CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.REACT_APP_CLOUDFLARE_API_TOKEN;

  // Refs for accessing DOM elements and recording data
  const videoPreviewRef = useRef(null);     // For live webcam preview
  const recordedVideoRef = useRef(null);    // For recorded video playback
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);

  // Extract setup camera to a standalone function so we can reuse it
  const setupCamera = async () => {
    try {
      // First make sure any existing tracks are stopped
      stopCamera();
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 1280, height: 720 }, 
        audio: true 
      });
      
      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
        videoPreviewRef.current.controls = false;
      }
      
      streamRef.current = stream;
      setCameraActive(true);
      setPermissionsGranted(true);
    } catch (err) {
      console.error('Error accessing webcam or microphone:', err);
      setUploadStatus('Error: Camera or microphone access denied');
      setCameraActive(false);
    }
  };
  
  // Dedicated function to explicitly stop the camera
  const stopCamera = () => {
    console.log('ATTEMPTING TO STOP CAMERA...');
    
    // First, ensure we stop all tracks individually
    if (streamRef.current) {
      console.log('Stopping all camera tracks...', streamRef.current);
      const tracks = streamRef.current.getTracks();
      console.log(`Found ${tracks.length} tracks to stop`);
      
      tracks.forEach(track => {
        try {
          console.log(`Stopping track: ${track.kind} (${track.readyState})`, track);
          track.enabled = false; // First disable it
          track.stop(); // Then stop it
          console.log(`Track stopped: ${track.readyState}`);
        } catch (err) {
          console.error('Error stopping track:', err);
        }
      });
    }
    
    // Also try to stop any audio and video tracks specifically
    try {
      const mediaDevices = navigator.mediaDevices;
      if (mediaDevices && typeof mediaDevices.getUserMedia === 'function') {
        // This is a workaround to help force permission dialogs to reappear
        console.log('Resetting user media access...');
      }
    } catch (err) {
      console.error('Error resetting media devices:', err);
    }
    
    // Clear the video element's source
    if (videoPreviewRef.current) {
      console.log('Clearing video source...');
      videoPreviewRef.current.pause();
      videoPreviewRef.current.srcObject = null;
      videoPreviewRef.current.load(); // Force a reload of the video element
    }
    
    // Set all refs to null
    streamRef.current = null;
    
    // Update state
    setCameraActive(false);
    console.log('Camera shutdown complete');
  };

  // Request camera permissions when component mounts
  useEffect(() => {
    // Don't automatically start camera on page load
    // setupCamera();
    fetchPreviousVideos();
    
    // Cleanup function to stop all tracks when component unmounts
    return () => {
      stopCamera();
    };
  }, []);
  
  // Add useEffect to load the Stream SDK
  useEffect(() => {
    // Load the Stream SDK
    const script = document.createElement('script');
    script.src = 'https://embed.cloudflarestream.com/embed/sdk.latest.js';
    script.async = true;
    
    // Add error handling for script loading
    script.onerror = () => {
      console.error('Failed to load Cloudflare Stream SDK');
      setUploadStatus('Failed to load video player. Please check your internet connection.');
    };
    
    script.onload = () => {
      console.log('Cloudflare Stream SDK loaded successfully');
    };
    
    document.body.appendChild(script);
    
    // Check video status periodically if we have an uploaded video
    let statusCheckInterval;
    if (uploadedVideoId) {
      // Start the processing indicator
      setIsProcessing(true);
      
      statusCheckInterval = setInterval(async () => {
        try {
          const response = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uploadedVideoId}`,
            {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': 'application/json'
              }
            }
          );
          
          const data = await response.json();
          if (data.success && data.result.status.state === 'ready') {
            console.log('Video is ready to play!');
            clearInterval(statusCheckInterval);
            setIsProcessing(false); // Stop the processing indicator
            setUploadStatus('Video ready to play!');
            // Refresh the list of videos after successful upload
            fetchPreviousVideos();
          } else if (data.success) {
            console.log('Video processing status:', data.result.status);
            setUploadStatus(`Video processing: ${data.result.status.state}`);
          }
        } catch (error) {
          console.error('Error checking video status:', error);
        }
      }, 5000); // Check every 5 seconds
    }
    
    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
      if (statusCheckInterval) {
        clearInterval(statusCheckInterval);
      }
    };
  }, [uploadedVideoId, accountId, apiToken]);
  
  // Initialize players for uploaded videos
  const initializePlayer = (playerElement, videoId) => {
    if (playerElement && window.Stream) {
      try {
        console.log(`Initializing player for video: ${videoId}`);
        const player = window.Stream(playerElement);
        
        // Add event listeners
        player.addEventListener('play', () => {
          console.log(`Video ${videoId} is playing!`);
        });
        
        player.addEventListener('error', (e) => {
          console.error(`Player error for ${videoId}:`, e);
        });
        
        // Try to play, but don't auto-start to avoid overwhelming the browser
        // with multiple video playback attempts
        player.addEventListener('canplay', () => {
          console.log(`Video ${videoId} is ready to play`);
        });
      } catch (err) {
        console.error('Error initializing player:', err);
      }
    }
  };

  // Fetch previously uploaded videos from Cloudflare Stream
  const fetchPreviousVideos = async () => {
    setIsLoadingVideos(true);
    try {
      console.log('Fetching videos from Cloudflare...');
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream?limit=10&status=ready`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      const data = await response.json();
      console.log('API response:', data);
      
      if (data.success) {
        // Filter to only include videos that are ready to play
        const readyVideos = data.result.filter(video => 
          video.status && video.status.state === 'ready'
        );
        
        setPreviousVideos(readyVideos);
        console.log('Fetched ready videos:', readyVideos);
        
        // Check for videos that aren't ready yet
        const processingVideos = data.result.filter(video => 
          !video.status || video.status.state !== 'ready'
        );
        
        if (processingVideos.length > 0) {
          console.log('Videos still processing:', processingVideos);
          setUploadStatus(`${processingVideos.length} video(s) still processing. They will appear when ready.`);
        }
      } else {
        console.error('Failed to fetch videos:', data.errors);
        setUploadStatus(`Error fetching videos: ${data.errors[0]?.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error fetching videos:', error);
      setUploadStatus(`Error fetching videos: ${error.message}`);
    }
    setIsLoadingVideos(false);
  };

  // Start recording from webcam
  const startRecording = () => {
    if (!streamRef.current) {
      setUploadStatus('Error: No camera access');
      return;
    }
    
    chunksRef.current = [];
    const mediaRecorder = new MediaRecorder(streamRef.current);
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };
    
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      setVideoBlob(blob);
      
      // Create a URL for the blob to preview
      const videoURL = URL.createObjectURL(blob);
      videoPreviewRef.current.srcObject = null;
      videoPreviewRef.current.src = videoURL;
      videoPreviewRef.current.controls = true;
      
      setUploadStatus('Recording complete. Ready to upload.');
    };
    
    mediaRecorder.start();
    mediaRecorderRef.current = mediaRecorder;
    setRecording(true);
    setUploadStatus('Recording in progress...');
  };

  // Stop recording
  const stopRecording = () => {
    if (!mediaRecorderRef.current) return;
    
    console.log('Stopping recording...');
    mediaRecorderRef.current.stop();
    setRecording(false);
    // Start processing state right after stopping recording
    setUploadStatus('Preparing video for upload...');
  };

  // Upload the recorded video to Cloudflare Stream
  const uploadToCloudflare = async () => {
    if (!videoBlob) return;
    
    setUploadStatus('Uploading to Cloudflare...');
    setIsProcessing(true); // Start processing indicator during upload
    
    try {
      // Create a FormData object to send the video file
      const formData = new FormData();
      formData.append('file', videoBlob, 'recorded-video.webm');
      
      // Upload the video to Cloudflare Stream
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiToken}`
          },
          body: formData
        }
      );
      
      const data = await response.json();
      
      if (data.success) {
        setUploadStatus('Upload successful! Processing video...');
        setUploadedVideoId(data.result.uid);
        console.log('Uploaded video ID:', data.result.uid);
        // Note: We keep processing true until the periodic check detects the video is ready
      } else {
        setUploadStatus(`Upload failed: ${data.errors[0].message}`);
      }
    } catch (error) {
      console.error('Error uploading video:', error);
      setUploadStatus(`Error: ${error.message}`);
    }
  };
  
  // Reset the recording process
  const resetRecording = () => {
    // Stop any existing camera first
    stopCamera();
    
    // Then reinitialize the camera
    setupCamera();
    
    // Reset the rest of the state
    setVideoBlob(null);
    setUploadStatus('');
    if (videoPreviewRef.current) {
      videoPreviewRef.current.controls = false;
    }
  };

  // Format date for display
  const formatDate = (dateString) => {
    const options = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    return new Date(dateString).toLocaleDateString(undefined, options);
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Webcam Recorder & Cloudflare Stream</h1>
      </header>
      
      <main>
        <div className="webcam-container">
          <h2>Webcam {cameraActive && <span className="camera-active">● LIVE</span>}</h2>
          <video 
            ref={videoPreviewRef} 
            autoPlay 
            playsInline
            muted={cameraActive} // Only mute when showing live camera
            className="webcam-preview"
          />
          
          <div className="button-container">
            {!recording && !videoBlob && !cameraActive && (
              <button 
                onClick={setupCamera} 
                className="camera-btn"
              >
                Start Camera
              </button>
            )}
            
            {!recording && !videoBlob && cameraActive && (
              <button 
                onClick={startRecording} 
                disabled={!permissionsGranted}
                className="record-btn"
              >
                Start Recording
              </button>
            )}
            
            {recording && (
              <button 
                onClick={stopRecording} 
                className="stop-btn"
              >
                Stop Recording
              </button>
            )}
            
            {videoBlob && (
              <>
                <button 
                  onClick={uploadToCloudflare} 
                  className="upload-btn"
                >
                  Upload to Cloudflare
                </button>
                
                <button 
                  onClick={resetRecording} 
                  className="reset-btn"
                >
                  Record Again
                </button>
              </>
            )}
            
            {cameraActive && !recording && (
              <button 
                onClick={stopCamera} 
                className="stop-camera-btn"
              >
                Turn Off Camera
              </button>
            )}
          </div>
          
          {uploadStatus && (
            <div className="status-container">
              <p>{uploadStatus}</p>
            </div>
          )}
        </div>
        
        {videoBlob && !uploadedVideoId && (
          <div className="video-preview-container">
            <h2>Video Preview</h2>
            <div className="video-wrapper">
              <video 
                ref={recordedVideoRef}
                controls
                src={URL.createObjectURL(videoBlob)}
                width="100%"
                height="auto"
              />
              {isProcessing && (
                <div className="processing-overlay">
                  <div className="spinner"></div>
                  <p>Processing video...</p>
                </div>
              )}
            </div>
          </div>
        )}
        
        {uploadedVideoId && (
          <div className="stream-container">
            <h2>Recently Uploaded Video</h2>
            <div className="iframe-container">
              {isProcessing ? (
                <div className="processing-overlay full-overlay">
                  <div className="spinner"></div>
                  <p>Processing video...</p>
                  <p className="processing-note">This may take a few minutes</p>
                </div>
              ) : (
                <iframe
                  src={`https://${customerCode}/${uploadedVideoId}/iframe`}
                  style={{ border: 'none' }}
                  height="720"
                  width="1280"
                  allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
                  allowFullScreen={true}
                  id="recent-stream-player"
                  ref={el => {
                    if (el) {
                      // Initialize player once the iframe is loaded
                      el.onload = () => initializePlayer(el, uploadedVideoId);
                    }
                  }}
                  onError={(e) => {
                    console.error('Iframe loading error:', e);
                    setUploadStatus('Error loading video player. Video may still be processing.');
                    setIsProcessing(true); // Set back to processing if iframe fails to load
                  }}
                ></iframe>
              )}
            </div>
          </div>
        )}
        
        <div className="previous-videos-container">
          <h2>Previous Recordings</h2>
          {isLoadingVideos ? (
            <p>Loading videos...</p>
          ) : previousVideos.length > 0 ? (
            <div className="videos-grid">
              {previousVideos.map(video => (
                <div key={video.uid} className="video-card">
                  <h3>{video.meta?.name || 'Untitled Video'}</h3>
                  <div className="iframe-container">
                    {/* These videos should be ready to play since we filtered for ready status */}
                    <iframe
                      src={`https://${customerCode}/${video.uid}/iframe`}
                      style={{ border: 'none' }}
                      height="360"
                      width="640"
                      allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
                      allowFullScreen={true}
                      className="stream-player"
                      ref={el => {
                        if (el) {
                          // Initialize player once the iframe is loaded
                          el.onload = () => initializePlayer(el, video.uid);
                        }
                      }}
                      onError={(e) => console.error(`Iframe loading error for video ${video.uid}:`, e)}
                    ></iframe>
                  </div>
                  <p className="video-date">
                    Recorded: {formatDate(video.created)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p>No previous recordings found.</p>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;