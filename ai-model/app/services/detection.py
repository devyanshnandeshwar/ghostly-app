import cv2
import numpy as np
import os

class GenderDetector:
    def __init__(self, model_dir="."):
        self.faceProto = os.path.join(model_dir, "opencv_face_detector.pbtxt")
        self.faceModel = os.path.join(model_dir, "opencv_face_detector_uint8.pb")
        self.genderProto = os.path.join(model_dir, "gender_deploy.prototxt")
        self.genderModel = os.path.join(model_dir, "gender_net.caffemodel")
        
        self.MODEL_MEAN_VALUES = (78.4263377603, 87.7689143744, 114.895847746)
        self.genderList = ['Male', 'Female']
        self.faceNet = None
        self.genderNet = None
        
        self.load_models()

    def load_models(self):
        print("Loading models...")
        try:
            self.faceNet = cv2.dnn.readNet(self.faceModel, self.faceProto)
            self.genderNet = cv2.dnn.readNet(self.genderModel, self.genderProto)
            print("Models loaded successfully.")
        except Exception as e:
            print(f"Error loading models: {e}")

    def get_face_box(self, frame, conf_threshold=0.7):
        frameOpencvDnn = frame.copy()
        frameHeight = frameOpencvDnn.shape[0]
        frameWidth = frameOpencvDnn.shape[1]
        blob = cv2.dnn.blobFromImage(frameOpencvDnn, 1.0, (300, 300), [104, 117, 123], True, False)

        self.faceNet.setInput(blob)
        detections = self.faceNet.forward()
        bboxes = []
        for i in range(detections.shape[2]):
            confidence = detections[0, 0, i, 2]
            if confidence > conf_threshold:
                x1 = int(detections[0, 0, i, 3] * frameWidth)
                y1 = int(detections[0, 0, i, 4] * frameHeight)
                x2 = int(detections[0, 0, i, 5] * frameWidth)
                y2 = int(detections[0, 0, i, 6] * frameHeight)
                bboxes.append([x1, y1, x2, y2])
        return frameOpencvDnn, bboxes

    def predict(self, image_bytes):
        if not self.faceNet or not self.genderNet:
            return {"error": "Models not loaded", "status": 503}

        nparr = np.frombuffer(image_bytes, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if frame is None:
            return {"error": "Invalid image data", "status": 400}

        padding = 20
        resultImg, faceBoxes = self.get_face_box(frame)

        if not faceBoxes:
            return {"error": "No face detected", "gender": None, "status": 422}

        # Use the first face found
        faceBox = faceBoxes[0]
        
        y1 = max(0, faceBox[1] - padding)
        y2 = min(faceBox[3] + padding, frame.shape[0] - 1)
        x1 = max(0, faceBox[0] - padding)
        x2 = min(faceBox[2] + padding, frame.shape[1] - 1)
        
        face = frame[y1:y2, x1:x2]

        blob = cv2.dnn.blobFromImage(face, 1.0, (227, 227), self.MODEL_MEAN_VALUES, swapRB=False)
        self.genderNet.setInput(blob)
        genderPreds = self.genderNet.forward()
        
        gender_idx = genderPreds[0].argmax()
        gender = self.genderList[gender_idx].lower()
        confidence = float(genderPreds[0][gender_idx])

        return {
            "gender": gender,
            "confidence": confidence,
            "status": 200
        }

# Global instance
detector = GenderDetector()
