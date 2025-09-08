/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Modality, Type } from "@google/genai";

type Page = 'home' | 'creator' | 'result' | 'loading' | 'profile';
type ImageFile = { b64: string; mimeType: string; };
type Pose = 'Standing Straight' | 'Slight 3/4 Turn' | 'Hands on Hips' | 'Walking Motion';
type BodyType = 'Rectangle' | 'Triangle' | 'Inverted Triangle' | 'Hourglass' | 'Round';

type BodyScan = {
    front: ImageFile | null;
    side: ImageFile | null;
    back: ImageFile | null;
};

type SavedOutfit = {
    id: string;
    name: string;
    image: string; // data URL
};

type Profile = {
    name: string;
    faceImage: ImageFile | null;
    bodyScans: BodyScan;
    height: string;
    weight: string;
    bodyType?: BodyType;
    chest?: string;
    waist?: string;
    hips?: string;
    savedOutfits: SavedOutfit[];
};

// Silhouette Guide for Body Scan
const SilhouetteGuide = ({ step }: { step: BodyScanStep }) => {
    // A single path for front and back view
    const frontBackPath = "M100,20 C111,20 120,29 120,40 C120,51 111,60 100,60 C89,60 80,51 80,40 C80,29 89,20 100,20 Z M130,70 L130,180 L140,330 L110,330 L110,210 L90,210 L90,330 L60,330 L70,180 L70,70 L130,70 Z";
    // A different path for the side view
    const sidePath = "M100,20 C111,20 120,29 120,40 C120,51 111,60 100,60 C89,60 80,51 80,40 C80,29 89,20 100,20 Z M105,70 L105,180 Q100 185, 100 195 L105,330 L85,330 L80,195 Q80 185, 75 180 L75,70 L105,70 Z";
    
    const pathData = (step === 'side') ? sidePath : frontBackPath;

    return (
        <div className="scan-silhouette-overlay" aria-hidden="true">
            <svg viewBox="0 0 200 350" preserveAspectRatio="xMidYMid meet">
                <path d={pathData} key={step} />
            </svg>
        </div>
    );
};


// Guided Body Scan Capture Component
type BodyScanStep = 'front' | 'side' | 'back';
const BodyScanCapture = ({ onComplete, onClose, setError }: {
    onComplete: (scans: BodyScan) => void;
    onClose: () => void;
    setError: (error: string | null) => void;
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const countdownIntervalRef = useRef<number | null>(null);
    const [step, setStep] = useState<BodyScanStep>('front');
    const [images, setImages] = useState<BodyScan>({ front: null, side: null, back: null });
    const [preview, setPreview] = useState<string | null>(null); // dataURL for preview
    const [countdown, setCountdown] = useState<number | null>(null);

    useEffect(() => {
        const startCamera = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    streamRef.current = stream;
                }
            } catch (err) {
                console.error("Camera access denied:", err);
                setError("Camera access was denied. Please enable camera permissions in your browser settings.");
                onClose();
            }
        };
        startCamera();
        
        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
            if (countdownIntervalRef.current) {
                clearInterval(countdownIntervalRef.current);
            }
        };
    }, [onClose, setError]);

    const instructions: Record<BodyScanStep, { title: string; guide: string; }> = {
        front: { title: "Step 1/3: Front View", guide: "Face the camera and align with the guide." },
        side: { title: "Step 2/3: Side View", guide: "Turn 90 degrees and match the silhouette." },
        back: { title: "Step 3/3: Back View", guide: "Face away from the camera, using the overlay." },
    };

    const handleCapture = () => {
        if (countdown !== null) return; // Prevent multiple countdowns

        let count = 3;
        setCountdown(count);

        countdownIntervalRef.current = window.setInterval(() => {
            count -= 1;
            setCountdown(count > 0 ? count : null);

            if (count === 0) {
                if (countdownIntervalRef.current) {
                    clearInterval(countdownIntervalRef.current);
                }

                if (!videoRef.current) return;
                const canvas = document.createElement('canvas');
                canvas.width = videoRef.current.videoWidth;
                canvas.height = videoRef.current.videoHeight;
                const context = canvas.getContext('2d');
                if (context) {
                    // Flash effect
                    const modalContent = document.querySelector('.camera-modal-content');
                    modalContent?.classList.add('flash-effect');
                    setTimeout(() => modalContent?.classList.remove('flash-effect'), 300);

                    context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
                    const dataUrl = canvas.toDataURL('image/jpeg');
                    setPreview(dataUrl);
                }
            }
        }, 1000);
    };

    const handleRetake = () => {
        setPreview(null);
    };

    const handleConfirm = () => {
        if (!preview) return;
        const base64 = preview.split(',')[1];
        const newImages = { ...images, [step]: { b64: base64, mimeType: 'image/jpeg' } };
        setImages(newImages);
        setPreview(null);
        
        if (step === 'front') {
            setStep('side');
        } else if (step === 'side') {
            setStep('back');
        } else if (step === 'back') {
            onComplete(newImages);
            onClose();
        }
    };

    return (
        <div className="camera-modal-overlay" onClick={onClose}>
            <div className="camera-modal-content body-scan-modal" onClick={(e) => e.stopPropagation()}>
                {countdown && <div className="countdown-display">{countdown}</div>}
                
                {!preview && <SilhouetteGuide step={step} />}

                <video 
                    ref={videoRef} 
                    autoPlay 
                    playsInline 
                    className="camera-video-feed"
                    style={{ display: preview ? 'none' : 'block' }}
                ></video>

                {preview && (
                    <div className="scan-preview" style={{ backgroundImage: `url(${preview})` }}>
                        <div className="preview-actions">
                             <button onClick={handleRetake} className="preview-action-button">
                                <i className="material-icons">replay</i>
                                <span>Retake</span>
                            </button>
                             <button onClick={handleConfirm} className="preview-action-button confirm">
                                <i className="material-icons">check_circle</i>
                                <span>Confirm</span>
                            </button>
                        </div>
                    </div>
                )}

                {!preview && (
                    <>
                        <div className="scan-instructions">
                            <h3>{instructions[step].title}</h3>
                            <p>{instructions[step].guide}</p>
                        </div>
                        <button className="capture-button" onClick={handleCapture} disabled={countdown !== null} aria-label={`Capture ${step} view`}>
                            <i className="material-icons">camera</i>
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};

// Helper for single image upload
const ImageUploader = ({ onImageUpload, image, title, description, id, setError }: {
    onImageUpload: (data: ImageFile) => void;
    image: ImageFile | null;
    title: string;
    description: string;
    id: string;
    setError: (error: string | null) => void;
}) => {
    const onFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement> | React.DragEvent<HTMLLabelElement>) => {
        event.preventDefault();
        setError(null);
        const files = 'dataTransfer' in event ? event.dataTransfer.files : event.target.files;
        if (files && files.length > 0) {
            const file = files[0];
            if (!file.type.startsWith('image/')) {
                setError(`Invalid file type for ${title}. Please upload an image.`);
                return;
            }
            const base64 = await fileToBase64(file);
            onImageUpload({ b64: base64, mimeType: file.type });
        }
    }, [onImageUpload, title, setError]);

    const onDragOver = useCallback((event: React.DragEvent<HTMLLabelElement>) => {
        event.preventDefault();
    }, []);

    return (
        <>
            <input type="file" id={id} style={{ display: 'none' }} onChange={onFileChange} accept="image/*" aria-label={`Upload ${title}`} />
            <label htmlFor={id} className="upload-box" onDrop={onFileChange} onDragOver={onDragOver}>
                {image ? (
                    <img src={`data:${image.mimeType};base64,${image.b64}`} alt={title} />
                ) : (
                    <>
                        <i className="material-icons">cloud_upload</i>
                        <h4>{title}</h4>
                        <p>{description}</p>
                    </>
                )}
            </label>
        </>
    );
};

// Helper to convert file to base64
const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(file);
    });
};

const ProfilePage = ({ profile, onSave, setPage }: {
    profile: Profile | null;
    onSave: (profile: Profile) => void;
    setPage: (page: Page) => void;
}) => {
    const [name, setName] = useState(profile?.name || '');
    const [faceImage, setFaceImage] = useState<ImageFile | null>(profile?.faceImage || null);
    const [bodyScans, setBodyScans] = useState<BodyScan>(profile?.bodyScans || { front: null, side: null, back: null });
    const [height, setHeight] = useState(profile?.height || '');
    const [weight, setWeight] = useState(profile?.weight || '');
    const [bodyType, setBodyType] = useState<BodyType | undefined>(profile?.bodyType);
    const [chest, setChest] = useState(profile?.chest || '');
    const [waist, setWaist] = useState(profile?.waist || '');
    const [hips, setHips] = useState(profile?.hips || '');
    const [savedOutfits, setSavedOutfits] = useState<SavedOutfit[]>(profile?.savedOutfits || []);
    const [localError, setLocalError] = useState<string | null>(null);
    const [isScanning, setIsScanning] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    const handleSave = () => {
        if (!name || !bodyScans.front || !bodyScans.side || !bodyScans.back || !height || !weight) {
            setLocalError('Please complete your name, measurements, and the 3-angle body scan.');
            return;
        }
        onSave({ name, faceImage, bodyScans, height, weight, bodyType, chest, waist, hips, savedOutfits });
        setPage('creator');
    };

    const handleScanComplete = (scans: BodyScan) => {
        setBodyScans(scans);
        setIsScanning(false);
    };
    
    const handleDeleteOutfit = (idToDelete: string) => {
        const updatedOutfits = savedOutfits.filter(outfit => outfit.id !== idToDelete);
        setSavedOutfits(updatedOutfits);
        onSave({ name, faceImage, bodyScans, height, weight, bodyType, chest, waist, hips, savedOutfits: updatedOutfits });
    };

    const bodyTypes: { name: BodyType, icon: string }[] = [
        { name: 'Rectangle', icon: 'square_foot' },
        { name: 'Triangle', icon: 'change_history' },
        { name: 'Inverted Triangle', icon: 'change_history' },
        { name: 'Hourglass', icon: 'hourglass_empty' },
        { name: 'Round', icon: 'circle' }
    ];

    const handleAnalyzeBodyType = async () => {
        if (!bodyScans.front || !bodyScans.side || !bodyScans.back || !height || !weight) {
            setLocalError("Please complete the body scan and provide height and weight before analyzing.");
            return;
        }
        setIsAnalyzing(true);
        setLocalError(null);

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

            const textPart = {
                text: `
Analyze the three provided body scan images (front, side, back) and the user's measurements to determine their body type. The measurements are:
- Height: ${height} feet
- Weight: ${weight} kilograms
${chest ? `- Chest: ${chest} inches` : ''}
${waist ? `- Waist: ${waist} inches` : ''}
${hips ? `- Hips: ${hips} inches` : ''}

Based on this data, classify the body shape into one of the following categories: 'Rectangle', 'Triangle', 'Inverted Triangle', 'Hourglass', 'Round'.

Return the answer in a JSON object with a single key "bodyType".
`
            };
            
            const imageParts = [
                { inlineData: { data: bodyScans.front.b64, mimeType: bodyScans.front.mimeType } },
                { inlineData: { data: bodyScans.side.b64, mimeType: bodyScans.side.mimeType } },
                { inlineData: { data: bodyScans.back.b64, mimeType: bodyScans.back.mimeType } },
            ];

            const schema = {
                type: Type.OBJECT,
                properties: {
                    bodyType: {
                        type: Type.STRING,
                        enum: ['Rectangle', 'Triangle', 'Inverted Triangle', 'Hourglass', 'Round'],
                    }
                }
            };

            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: { parts: [...imageParts, textPart] },
                config: {
                    responseMimeType: "application/json",
                    responseSchema: schema,
                },
            });

            const result = JSON.parse(response.text);
            const suggestedType = result.bodyType as BodyType;

            if (suggestedType && bodyTypes.map(b => b.name).includes(suggestedType)) {
                setBodyType(suggestedType);
            } else {
                setLocalError("The AI could not determine a body type. Please select one manually.");
            }

        } catch (e: any) {
            console.error("AI Body Type Analysis failed:", e);
            setLocalError("An error occurred during AI analysis. Please try again or select a type manually.");
        } finally {
            setIsAnalyzing(false);
        }
    };
    

    return (
        <div className="page-container profile-page">
            <header className="page-header">
                <h2>{profile ? 'Manage Your Profile' : 'Create Your Profile'}</h2>
                <p>{profile ? 'Update your details below.' : 'First, let\'s set up your digital twin.'}</p>
            </header>

            <div className="step-card">
                <h3>Your Name</h3>
                <div className="input-group">
                    <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Alex Doe" aria-label="Your Name" />
                </div>
            </div>

            <div className="step-card">
                <h3>Your Face (Optional)</h3>
                <p className="description">Upload a clear, front-facing selfie for a more realistic virtual try-on.</p>
                <ImageUploader
                    id="face-upload"
                    onImageUpload={setFaceImage}
                    image={faceImage}
                    title="Upload Selfie"
                    description="Drop an image or click to browse"
                    setError={setLocalError}
                />
            </div>

            <div className="step-card">
                <h3>Your Body Scan</h3>
                <p className="description">A 3-angle scan helps the AI create a perfect fit.</p>
                <div className="body-scan-section">
                    {(['front', 'side', 'back'] as const).map(view => (
                        <div className="scan-slot" key={view}>
                            {bodyScans[view] ? (
                                <img src={`data:${bodyScans[view]!.mimeType};base64,${bodyScans[view]!.b64}`} alt={`${view} view`} />
                            ) : (
                                <div className="placeholder">
                                    <i className="material-icons">person_search</i>
                                </div>
                            )}
                            <div className="scan-slot-label">{view.charAt(0).toUpperCase() + view.slice(1)} View</div>
                        </div>
                    ))}
                </div>
                <button className="primary-button full-width" onClick={() => setIsScanning(true)}>
                    <i className="material-icons">camera_alt</i>
                    {bodyScans.front ? 'Redo Body Scan' : 'Start Body Scan'}
                </button>
            </div>
            
             <div className="step-card">
                <h3>Body Shape & Measurements</h3>
                <p className="description">Providing these details helps the AI create a more accurate fit.</p>
                
                 <div className="body-type-header">
                     <h4>Body Type</h4>
                     <button
                        className="suggest-button"
                        onClick={handleAnalyzeBodyType}
                        disabled={!bodyScans.front || !bodyScans.side || !bodyScans.back || !height || !weight || isAnalyzing}
                     >
                        {isAnalyzing ? (
                            <>
                                <div className="spinner"></div>
                                <span>Analyzing...</span>
                            </>
                        ) : (
                            <>
                                <i className="material-icons">auto_awesome</i>
                                <span>Suggest for Me</span>
                            </>
                        )}
                     </button>
                </div>
                <div className="body-type-selector">
                    {bodyTypes.map(({ name, icon }) => (
                        <button 
                            key={name}
                            className={`body-type-button ${bodyType === name ? 'active' : ''} ${name === 'Inverted Triangle' ? 'inverted' : ''}`}
                            onClick={() => setBodyType(name)}
                            aria-pressed={bodyType === name}
                        >
                            <i className="material-icons">{icon}</i>
                            <span>{name}</span>
                        </button>
                    ))}
                </div>
                 
                <div className="details-inputs">
                    <div className="input-group">
                        <label htmlFor="height">Height (ft)</label>
                        <input id="height" type="number" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="e.g., 5.8" aria-label="Height in feet" />
                    </div>
                    <div className="input-group">
                        <label htmlFor="weight">Weight (kg)</label>
                        <input id="weight" type="number" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="e.g., 70" aria-label="Weight in kilograms" />
                    </div>
                     <div className="input-group">
                        <label htmlFor="chest">Chest (in)</label>
                        <input id="chest" type="number" value={chest} onChange={(e) => setChest(e.target.value)} placeholder="Optional" aria-label="Chest in inches" />
                    </div>
                    <div className="input-group">
                        <label htmlFor="waist">Waist (in)</label>
                        <input id="waist" type="number" value={waist} onChange={(e) => setWaist(e.target.value)} placeholder="Optional" aria-label="Waist in inches" />
                    </div>
                    <div className="input-group">
                        <label htmlFor="hips">Hips (in)</label>
                        <input id="hips" type="number" value={hips} onChange={(e) => setHips(e.target.value)} placeholder="Optional" aria-label="Hips in inches" />
                    </div>
                </div>
            </div>

            {savedOutfits.length > 0 && (
                <div className="step-card">
                    <h3>My Lookbook</h3>
                    <div className="saved-outfits-grid">
                        {savedOutfits.map(outfit => (
                            <div key={outfit.id} className="image-thumbnail saved-outfit-thumbnail">
                                <img src={outfit.image} alt={outfit.name} />
                                <div className="outfit-caption">{outfit.name}</div>
                                <button className="remove-image-button" onClick={() => handleDeleteOutfit(outfit.id)} aria-label={`Delete outfit ${outfit.name}`}>&times;</button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {localError && <div className="error-message" role="alert">{localError}</div>}

             {isScanning && <BodyScanCapture onComplete={handleScanComplete} onClose={() => setIsScanning(false)} setError={setLocalError} />}

            <div className="action-panel">
                <button className="primary-button" onClick={handleSave}>Save Profile & Continue</button>
            </div>
        </div>
    );
};

const Header = ({ page, setPage }: { page: Page, setPage: (page: Page) => void }) => {
    if (page === 'loading') return null;
    return (
        <header className="app-header">
            <h1 className="app-logo" onClick={() => setPage('home')}>AI Fashion Studio</h1>
            <div className="header-nav">
                <button onClick={() => setPage('profile')} aria-label="Manage Profile">
                    <i className="material-icons">account_circle</i>
                </button>
            </div>
        </header>
    );
};


const App = () => {
    const [page, setPage] = useState<Page>('loading');
    const [pageKey, setPageKey] = useState(Date.now()); // Used to force re-render for animations
    const [profile, setProfile] = useState<Profile | null>(null);
    const [clothingImage, setClothingImage] = useState<ImageFile | null>(null);
    const [selectedPose, setSelectedPose] = useState<Pose>('Standing Straight');
    const [resultImage, setResultImage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isSavingOutfit, setIsSavingOutfit] = useState(false);
    const [newOutfitName, setNewOutfitName] = useState("");
    const [isOutfitSaved, setIsOutfitSaved] = useState(false);

    const loadingTips = useMemo(() => [
        "Analyzing fabric texture and weight...",
        "Simulating realistic clothing drape...",
        "Matching lighting to the material's properties...",
        "Perfecting the fit on your digital twin...",
        "Rendering final high-resolution details...",
        "Almost there! Great style takes a moment."
    ], []);
    const [currentTip, setCurrentTip] = useState(loadingTips[0]);

    // Effect to cycle through loading tips
    useEffect(() => {
        if (page === 'loading' && resultImage === null) { // Only cycle tips during generation
            const tipInterval = setInterval(() => {
                setCurrentTip(prevTip => {
                    const currentIndex = loadingTips.indexOf(prevTip);
                    const nextIndex = (currentIndex + 1) % loadingTips.length;
                    return loadingTips[nextIndex];
                });
            }, 3000);
            return () => clearInterval(tipInterval);
        }
    }, [page, loadingTips, resultImage]);

    // Effect to load profile from localStorage on initial load
    useEffect(() => {
        try {
            const savedProfile = localStorage.getItem('ai-fashion-profile');
            if (savedProfile) {
                setProfile(JSON.parse(savedProfile));
                setPage('creator');
            } else {
                setPage('home');
            }
        } catch (e) {
            console.error("Failed to load profile from storage:", e);
            setPage('home');
        }
    }, []);

    const handleSaveProfile = useCallback((newProfile: Profile) => {
        try {
            localStorage.setItem('ai-fashion-profile', JSON.stringify(newProfile));
            setProfile(newProfile);
            setError(null);
        } catch (e) {
            console.error("Failed to save profile to storage:", e);
            setError("Could not save your profile. Your browser storage might be full.");
        }
    }, []);

    const handleGenerate = async () => {
        if (!profile || !clothingImage || !profile.bodyScans.front || !profile.bodyScans.side || !profile.bodyScans.back) {
            setError("Please complete your profile, including the 3-angle body scan, and upload a clothing image first.");
            return;
        }
        setPage('loading');
        setResultImage(null); // Clear previous result
        setError(null);

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            
            const clothingImagePart = {
                inlineData: { data: clothingImage.b64, mimeType: clothingImage.mimeType },
            };

            const textPart = {
                text: `
You are an expert AI fashion stylist and virtual try-on specialist. Your task is to generate a photorealistic image of a person wearing a specific piece of clothing based on reference photos.

**1. Analyze the User's Features (From Reference Images):**
- **Body Structure Reference:** You are provided with three body scan images (front, side, back). These images are **for reference only**.
- From these scans, meticulously analyze and understand the user's:
    - **Body Shape:** Is it ${profile.bodyType || 'not specified'}?
    - **Proportions:** Limb length, torso-to-leg ratio, etc.
    - **Posture:** How they naturally stand.
    - **Build:** How fat or slim they are.
- **Facial Features Reference:** ${profile.faceImage ? "You are also provided with a selfie. Use this to understand the user's facial features, skin tone, and hairstyle." : "No selfie provided; generate a face that matches the general features of the person in the body scans."}

**2. Analyze the Garment:**
- From the clothing image, identify the item's style, cut, color, and fabric type (e.g., denim, silk, cotton, wool).

**3. Core Task: Generate a NEW Photorealistic Image**
- **DO NOT EDIT OR MODIFY the input reference images.** Your primary task is to **generate a completely new image from scratch.**
- Create a photorealistic "digital twin" of the user based on your analysis from step 1. This new person must have the same body structure, posture, and facial features as the user in the reference photos.
- Place this newly generated person in a **'${selectedPose}'** pose.
- Realistically simulate and drape the analyzed garment onto this digital twin. Pay close attention to how the fabric would hang, fold, and stretch on their specific body shape.
- The final output must be a single, full-body, high-resolution image against a clean, neutral studio background. The image must not contain any text, logos, or watermarks.
- **Crucial Constraint:** The final generated image's pose and background **must be different** from the input body scan photos, proving it is a new creation.
`
            };
            
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image-preview',
                contents: {
                    parts: [
                        ...(profile.faceImage ? [{ inlineData: { data: profile.faceImage.b64, mimeType: profile.faceImage.mimeType } }] : []),
                        { inlineData: { data: profile.bodyScans.front.b64, mimeType: profile.bodyScans.front.mimeType } },
                        { inlineData: { data: profile.bodyScans.side.b64, mimeType: profile.bodyScans.side.mimeType } },
                        { inlineData: { data: profile.bodyScans.back.b64, mimeType: profile.bodyScans.back.mimeType } },
                        clothingImagePart,
                        textPart,
                    ],
                },
                config: {
                    responseModalities: [Modality.IMAGE, Modality.TEXT],
                },
            });
            
            let generatedImage: ImageFile | null = null;
            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData && part.inlineData.mimeType.startsWith('image/')) {
                    generatedImage = { b64: part.inlineData.data, mimeType: part.inlineData.mimeType };
                    break;
                }
            }
            
            if (generatedImage) {
                setResultImage(`data:${generatedImage.mimeType};base64,${generatedImage.b64}`);
                setPage('result');
                setIsOutfitSaved(false); // Reset saved state for new outfit
                setNewOutfitName(""); // Reset outfit name
            } else {
                throw new Error("The AI did not return an image. It might have responded with text instead. Please check your prompt or try a different image.");
            }

        } catch (e: any) {
            console.error("Image generation failed:", e);
            setError(`Sorry, we couldn't generate the image. ${e.message || 'Please try again.'}`);
            setPage('creator');
        }
    };
    
    const handleSaveOutfit = () => {
        if (!resultImage || !newOutfitName.trim() || !profile) return;
        
        const newOutfit: SavedOutfit = {
            id: `outfit-${Date.now()}`,
            name: newOutfitName.trim(),
            image: resultImage,
        };
        
        const updatedProfile = {
            ...profile,
            savedOutfits: [newOutfit, ...profile.savedOutfits],
        };
        
        handleSaveProfile(updatedProfile);
        setIsSavingOutfit(false);
        setIsOutfitSaved(true);
    };

    const handleRetry = () => {
        setResultImage(null);
        setPage('creator');
        setPageKey(Date.now());
    };

    const renderPage = () => {
        switch (page) {
            case 'home':
                return (
                    <div className="page-container home-page">
                        <i className="material-icons icon">styler</i>
                        <h1>Welcome to the AI Fashion Studio</h1>
                        <p>Create your digital twin, upload clothing, and see how it fits instantly. Your personal fitting room is just a click away.</p>
                        <div className="home-actions">
                            <button className="primary-button" onClick={() => setPage('profile')}>
                                {profile ? 'Go to My Profile' : 'Create My Profile'}
                            </button>
                            {profile && <button className="secondary-button" onClick={() => setPage('creator')}>Start Creating</button>}
                        </div>
                    </div>
                );
            case 'profile':
                return <ProfilePage profile={profile} onSave={handleSaveProfile} setPage={setPage} />;
            case 'creator':
                const poses: Pose[] = ['Standing Straight', 'Slight 3/4 Turn', 'Hands on Hips', 'Walking Motion'];
                return (
                     <div className="page-container creator-page">
                        <div className="page-header">
                            <h2>Create Your Look</h2>
                            <p>Upload a piece of clothing and select a pose to see it on your digital twin.</p>
                        </div>
                        
                        <div className="step-card">
                            <h3>1. Upload Clothing</h3>
                            <ImageUploader 
                                id="clothing-upload"
                                onImageUpload={setClothingImage}
                                image={clothingImage}
                                title="Upload Garment"
                                description="Drop an image or click to browse"
                                setError={setError}
                            />
                        </div>
                        
                        <div className="step-card">
                            <h3>2. Choose a Pose</h3>
                             <div className="pose-selection-container">
                                {poses.map(pose => (
                                    <button
                                        key={pose}
                                        className={`pose-button ${selectedPose === pose ? 'active' : ''}`}
                                        onClick={() => setSelectedPose(pose)}
                                        aria-pressed={selectedPose === pose}
                                    >
                                        {pose}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {error && <div className="error-message" role="alert">{error}</div>}

                        <div className="action-panel">
                            <button className="primary-button" onClick={handleGenerate} disabled={!clothingImage || !profile}>
                                <i className="material-icons">auto_awesome</i>
                                Generate Try-On
                            </button>
                        </div>
                    </div>
                );
            case 'result':
                return (
                    <div className="page-container result-section">
                        <div className="page-header">
                            <h2>Your Virtual Try-On</h2>
                        </div>
                        {resultImage && <img src={resultImage} alt="Virtual try-on result" className="result-image" />}

                        {isSavingOutfit ? (
                            <div className="save-outfit-form">
                                <input
                                    type="text"
                                    value={newOutfitName}
                                    onChange={(e) => setNewOutfitName(e.target.value)}
                                    placeholder="e.g., Summer Casual Look"
                                    aria-label="Outfit Name"
                                    autoFocus
                                />
                                <div className="result-actions">
                                    <button className="secondary-button" onClick={() => setIsSavingOutfit(false)}>Cancel</button>
                                    <button className="primary-button" onClick={handleSaveOutfit} disabled={!newOutfitName.trim()}>Save</button>
                                </div>
                            </div>
                        ) : (
                             <div className="result-actions">
                                <button className="primary-button" onClick={handleRetry}>
                                    <i className="material-icons">replay</i> Try Another
                                </button>
                                <button
                                    className="secondary-button"
                                    onClick={() => isOutfitSaved ? {} : setIsSavingOutfit(true)}
                                    disabled={isOutfitSaved}
                                >
                                    <i className="material-icons">{isOutfitSaved ? 'check' : 'bookmark_add'}</i>
                                    {isOutfitSaved ? 'Saved to Lookbook' : 'Save Outfit'}
                                </button>
                            </div>
                        )}
                    </div>
                );
            case 'loading':
                return (
                    <div className="page-container loading-section">
                        <div className="loader"></div>
                        <h2>Creating your look...</h2>
                        <p>{currentTip}</p>
                    </div>
                );
        }
    };

    return (
        <>
            <Header page={page} setPage={setPage} />
            <main>
                <div className="page-transition" key={pageKey}>
                    {renderPage()}
                </div>
            </main>
        </>
    );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);