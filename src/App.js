import React, { useState, useRef, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faMicrophone,
  faStop,
  faHeadset,
  faArrowLeft,
  faUser,
  faRobot,
  faMicrophoneLines,
  faBrain,
  faLock,
  faHeart,
} from "@fortawesome/free-solid-svg-icons";
import "./App.css";

const App = () => {
  const [showChat, setShowChat] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState({
    text: "Ready to chat",
    type: "normal",
  });
  const [messages, setMessages] = useState([]);
  const [progress, setProgress] = useState(0);
  const [roomName, setRoomName] = useState("");
  const [aiSpeaking, setAiSpeaking] = useState(false);

  // Refs
  const webSocketRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const chatHistoryRef = useRef(null);
  const progressIntervalRef = useRef(null);

  // Constants
  const ELEVEN_LABS_API_KEY = process.env.ELEVEN_LABS_API_KEY;
  const ELEVEN_LABS_VOICE_ID = process.env.ELEVEN_LABS_VOICE_ID;
  const BACKEND_WEB_SOCKET = process.env.BACKEND_WEB_SOCKET;

  useEffect(() => {
    if (chatHistoryRef.current) {
      chatHistoryRef.current.scrollTop = chatHistoryRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
      if (webSocketRef.current) {
        webSocketRef.current.close();
      }
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== "inactive"
      ) {
        mediaRecorderRef.current.stream
          .getTracks()
          .forEach((track) => track.stop());
      }
    };
  }, []);

  const startChat = async () => {
    try {
      const response = await fetch("http://localhost:4001/get-token");
      if (!response.ok) {
        throw new Error("Failed to get access token");
      }

      const { roomName } = await response.json();
      setRoomName(roomName);
      initWebSocket();
      setShowChat(true);
      setStatus({
        text: "Connected! Click the microphone button to speak.",
        type: "success",
      });
    } catch (error) {
      console.error("Error starting chat:", error);
      alert("Failed to start chat. Please try again.");
    }
  };

  const endChat = () => {
    if (isRecording) {
      stopRecording();
    }

    if (
      webSocketRef.current &&
      webSocketRef.current.readyState === WebSocket.OPEN
    ) {
      webSocketRef.current.close();
    }

    setShowChat(false);
    setMessages([]);
  };

  const initWebSocket = () => {
    webSocketRef.current = new WebSocket("");

    webSocketRef.current.onopen = () => {
      console.log("WebSocket connection established");
      setStatus({
        text: "Connected! Click the microphone button to speak.",
        type: "success",
      });
    };

    webSocketRef.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("Received data:", data);

        if (data.type === "ai_response") {
          setMessages((prev) => [
            ...prev,
            { sender: "You", text: data.userText },
            { sender: "AI", text: data.aiText },
          ]);

          if (data.aiText && typeof data.aiText === "string") {
            speakWithElevenLabs(data.aiText);
          } else {
            console.error("Invalid aiText received:", data.aiText);
            setStatus({
              text: "Received invalid response. Try again.",
              type: "error",
            });
          }
        } else if (data.type === "error") {
          console.error("Error from server:", data.message);
          setStatus({
            text: `Error: ${data.message}. Try again.`,
            type: "error",
          });
        }
      } catch (error) {
        console.error("Error processing WebSocket message:", error);
        setStatus({
          text: "Error processing response. Try again.",
          type: "error",
        });
      }
    };

    webSocketRef.current.onerror = (error) => {
      console.error("WebSocket error:", error);
      setStatus({
        text: "Connection error. Please refresh the page.",
        type: "error",
      });
    };

    webSocketRef.current.onclose = () => {
      console.log("WebSocket connection closed");
      setStatus({
        text: "Connection closed. Please refresh to reconnect.",
        type: "error",
      });
    };
  };

  const toggleRecording = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    // Prevent recording if AI is currently speaking
    if (aiSpeaking) {
      return;
    }

    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.addEventListener("dataavailable", (event) => {
        audioChunksRef.current.push(event.data);
      });

      mediaRecorderRef.current.addEventListener("stop", sendAudioToServer);

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setStatus({
        text: "Recording... Click again to stop.",
        type: "listening",
      });
      startProgressAnimation();
    } catch (error) {
      console.error("Error starting recording:", error);
      setStatus({
        text: "Failed to access microphone. Please check permissions.",
        type: "error",
      });
    }
  };

  const stopRecording = () => {
    if (
      !mediaRecorderRef.current ||
      mediaRecorderRef.current.state === "inactive"
    )
      return;

    try {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream
        .getTracks()
        .forEach((track) => track.stop());
      setIsRecording(false);
      setStatus({ text: "Processing your audio...", type: "normal" });
      setProgress(0);

      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    } catch (error) {
      console.error("Error stopping recording:", error);
      setStatus({
        text: "Error processing recording. Please try again.",
        type: "error",
      });
    }
  };

  const startProgressAnimation = () => {
    let width = 0;
    setProgress(0);

    progressIntervalRef.current = setInterval(() => {
      if (!isRecording) {
        clearInterval(progressIntervalRef.current);
        return;
      }

      width += 0.5;
      if (width >= 100) {
        clearInterval(progressIntervalRef.current);
        stopRecording();
      } else {
        setProgress(width);
      }
    }, 100);
  };

  const sendAudioToServer = () => {
    try {
      const audioBlob = new Blob(audioChunksRef.current, { type: "audio/wav" });
      const reader = new FileReader();

      reader.onload = () => {
        const base64Audio = reader.result.split(",")[1]; 

        if (
          webSocketRef.current &&
          webSocketRef.current.readyState === WebSocket.OPEN
        ) {
          webSocketRef.current.send(
            JSON.stringify({
              type: "speech",
              roomName: roomName,
              audio: base64Audio,
            })
          );
        } else {
          setStatus({
            text: "Connection lost. Please refresh the page.",
            type: "error",
          });
        }
      };

      reader.readAsDataURL(audioBlob);
    } catch (error) {
      console.error("Error sending audio:", error);
      setStatus({
        text: "Failed to send audio. Please try again.",
        type: "error",
      });
    }
  };
  const speakWithElevenLabs = async (text) => {
    try {
      setStatus({ text: "Generating voice response...", type: "normal" });

      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_LABS_VOICE_ID}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "xi-api-key": ELEVEN_LABS_API_KEY,
          },
          body: JSON.stringify({
            text: text,
            model_id: "eleven_monolingual_v1",
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
            },
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Eleven Labs API error: ${response.status}`);
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);

      audio.onplay = () => {
        setStatus({ text: "AI is speaking...", type: "normal" });
        setAiSpeaking(true);
      };

      audio.onended = () => {
        setStatus({
          text: "Ready to chat. Click the button to speak.",
          type: "success",
        });
        setAiSpeaking(false); 
      };

      audio.play();
    } catch (error) {
      console.error("Error generating voice:", error);
      setStatus({ text: "Error generating voice. Try again.", type: "error" });
      setAiSpeaking(false); 
    }
  };

  return (
    <div className="app-container">
      {!showChat ? (
        <div className="welcome-container">
          <div className="header">
            <div className="logo-container">
              <h1>Whisper</h1>
            </div>
            <p>Premium AI Voice Assistant</p>
          </div>

          <div className="chat-container fade-in">
            <div className="welcome-content">
              <h2>The Next Generation Voice AI</h2>
              <p>
                Experience natural conversations with our advanced AI voice
                assistant. Powered by cutting-edge machine learning, Whisper
                understands context, remembers your preferences, and responds
                with human-like voice quality.
              </p>

              <div className="features">
                <div className="feature">
                  <div className="feature-icon">
                    <FontAwesomeIcon icon={faMicrophoneLines} />
                  </div>
                  <h3>Premium Voice</h3>
                  <p>
                    Ultra-realistic voice synthesis powered by Eleven Labs
                    technology.
                  </p>
                </div>

                <div className="feature">
                  <div className="feature-icon">
                    <FontAwesomeIcon icon={faBrain} />
                  </div>
                  <h3>Smart Responses</h3>
                  <p>
                    Contextual understanding with advanced natural language
                    processing.
                  </p>
                </div>

                <div className="feature">
                  <div className="feature-icon">
                    <FontAwesomeIcon icon={faLock} />
                  </div>
                  <h3>Secure Platform</h3>
                  <p>End-to-end encryption keeps your conversations private.</p>
                </div>
              </div>

              <button className="button" onClick={startChat}>
                <FontAwesomeIcon icon={faHeadset} /> Begin Voice Chat
              </button>
            </div>
          </div>

          <div className="footer">
            <div className="powered-by">
              <span>Made with</span>
              <FontAwesomeIcon icon={faHeart} style={{ color: "#ef4444" }} />
              <span>in India</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="voice-chat-container">
          <div className="header">
            <div className="logo-container">
              <h1>Whisper</h1>
            </div>
            <p>Premium AI Voice Assistant</p>
          </div>

          <div className="status fade-in">
            <div className={`status-indicator ${status.type}`}></div>
            <span>{status.text}</span>
          </div>

          <div className="chat-container fade-in">
            <div className="chat-history" ref={chatHistoryRef}>
              {messages.map((message, index) => (
                <div key={index} className="message-wrapper">
                  <div
                    className={
                      message.sender === "You" ? "user-message" : "ai-message"
                    }
                  >
                    {message.text}
                  </div>
                  <div
                    className={
                      message.sender === "You"
                        ? "avatar user-avatar"
                        : "avatar ai-avatar"
                    }
                  >
                    <FontAwesomeIcon
                      icon={message.sender === "You" ? faUser : faRobot}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="progress-bar">
              <div className="progress" style={{ width: `${progress}%` }}></div>
            </div>

            <button
              className={`record-button ${isRecording ? "recording" : ""}`}
              onClick={toggleRecording}
            >
              <FontAwesomeIcon icon={isRecording ? faStop : faMicrophone} />
            </button>

            <p className="status">
              Click the button to speak, click again to stop
            </p>
          </div>

          <button className="button" onClick={endChat}>
            <FontAwesomeIcon icon={faArrowLeft} /> End Conversation
          </button>
        </div>
      )}
    </div>
  );
};

export default App;
