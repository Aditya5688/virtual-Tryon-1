/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Modality } from "@google/genai";

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
    bodyScans: BodyScan;
    height: string;
    weight: string;
    bodyType?: BodyType;
    chest?: string;
    waist?: string;
    hips?: string;
    savedOutfits: SavedOutfit[];
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
        front: { title: "Step 1/3: Front View", guide: "Stand straight, facing the camera." },
        side: { title: "Step 2/3: Side View", guide: "Turn 90 degrees to your side." },
        back: { title: "Step 3/3: Back View", guide: "Turn around, facing away from the camera." },
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
                {preview ? (
                    <div className="scan-preview">
                        <img src={preview} alt={`${step} preview`} />
                        <div className="preview-controls">
                            <button onClick={handleRetake} className="secondary-button">Retake</button>
                            <button onClick={handleConfirm} className="primary-button">Confirm</button>
                        </div>
                    </div>
                ) : (
                    <>
                        <video ref={videoRef} autoPlay playsInline className="camera-video-feed"></video>
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

    const handleSave = () => {
        if (!name || !bodyScans.front || !bodyScans.side || !bodyScans.back || !height || !weight) {
            setLocalError('Please complete your name, measurements, and the 3-angle body scan.');
            return;
        }
        onSave({ name, bodyScans, height, weight, bodyType, chest, waist, hips, savedOutfits });
        setPage('creator');
    };

    const handleScanComplete = (scans: BodyScan) => {
        setBodyScans(scans);
        setIsScanning(false);
    };
    
    const handleDeleteOutfit = (idToDelete: string) => {
        const updatedOutfits = savedOutfits.filter(outfit => outfit.id !== idToDelete);
        setSavedOutfits(updatedOutfits);
        onSave({ name, bodyScans, height, weight, bodyType, chest, waist, hips, savedOutfits: updatedOutfits });
    };
    
    const bodyTypes: { name: BodyType, icon: string }[] = [
        { name: 'Rectangle', icon: 'crop_portrait' },
        { name: 'Triangle', icon: 'change_history' },
        { name: 'Inverted Triangle', icon: 'change_history' },
        { name: 'Hourglass', icon: 'hourglass_empty' },
        { name: 'Round', icon: 'circle' }
    ];

    return (
        <div className="page-container profile-page">
            <header className="page-header">
                <h2>{profile ? 'Manage Your Profile' : 'Create Your Profile'}</h2>
                <p>{profile ? 'Update your details below.' : 'First, let\'s set up your profile.'}</p>
            </header>

            <div className="step-card">
                <h3>Your Name</h3>
                <div className="input-group">
                    <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Alex Doe" aria-label="Your Name" />
                </div>
            </div>

            <div className="step-card">
                <h3>Your Body Scan</h3>
                <p className="description" style={{ color: 'var(--secondary-text)', fontSize: '0.9rem', textAlign: 'center', marginBottom: '1rem' }}>A 3-angle scan helps the AI create a perfect fit.</p>
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
                <p className="description" style={{ color: 'var(--secondary-text)', fontSize: '0.9rem', textAlign: 'center', marginBottom: '1rem' }}>Providing these details helps the AI create a more accurate fit.</p>
                
                 <h4>Body Type</h4>
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
        "Analyzing fabric textures...",
        "Simulating realistic drape & flow...",
        "Matching lighting conditions...",
        "Constructing a 3D model from your scan...",
        "Applying clothing to your digital twin...",
        "Rendering the final, photorealistic image..."
    ], []);
    const [tip, setTip] = useState(loadingTips[0]);
    
    useEffect(() => {
        if (page === 'loading') {
            const interval = setInterval(() => {
                setTip(prevTip => {
                    const currentIndex = loadingTips.indexOf(prevTip);
                    const nextIndex = (currentIndex + 1) % loadingTips.length;
                    return loadingTips[nextIndex];
                });
            }, 2500);
            return () => clearInterval(interval);
        }
    }, [page, loadingTips]);

    const changePage = (newPage: Page) => {
        setPageKey(Date.now());
        setPage(newPage);
    };

    useEffect(() => {
        const savedProfileJSON = localStorage.getItem('userProfile');
        if (savedProfileJSON) {
            const savedProfile = JSON.parse(savedProfileJSON);
            if (savedProfile.photos) {
                savedProfile.bodyScans = {
                    front: savedProfile.photos[0] || null,
                    side: savedProfile.photos[1] || null,
                    back: savedProfile.photos[2] || null,
                };
                delete savedProfile.photos;
            }
            if (!savedProfile.bodyScans) {
                savedProfile.bodyScans = { front: null, side: null, back: null };
            }
            if (!savedProfile.savedOutfits) {
                savedProfile.savedOutfits = [];
            }
            setProfile(savedProfile);
            changePage('home');
        } else {
            changePage('profile');
        }
    }, []);

    const handleSaveProfile = (newProfile: Profile) => {
        setProfile(newProfile);
        localStorage.setItem('userProfile', JSON.stringify(newProfile));
    };

    const handleGenerate = useCallback(async () => {
        if (!clothingImage || !profile) {
            setError("Please upload a clothing item and ensure your profile is complete.");
            return;
        }

        if (!profile.bodyScans.front || !profile.bodyScans.side || !profile.bodyScans.back) {
            setError("Please complete the 3-angle body scan in your profile for best results.");
            changePage('profile');
            return;
        }

        changePage('loading');
        setError(null);
        setResultImage(null);
        
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

        const clothingPart = { inlineData: { data: clothingImage.b64, mimeType: clothingImage.mimeType } };
        const personParts = [
            { inlineData: { data: profile.bodyScans.front.b64, mimeType: profile.bodyScans.front.mimeType } },
            { inlineData: { data: profile.bodyScans.side.b64, mimeType: profile.bodyScans.side.mimeType } },
            { inlineData: { data: profile.bodyScans.back.b64, mimeType: profile.bodyScans.back.mimeType } },
        ];
        
        const userProvidedProfile = `
- Height: ${profile.height} feet
- Weight: ${profile.weight} kilograms
${profile.bodyType ? `- Body Type: ${profile.bodyType}` : ''}
${profile.chest ? `- Chest: ${profile.chest} inches` : ''}
${profile.waist ? `- Waist: ${profile.waist} inches` : ''}
${profile.hips ? `- Hips: ${profile.hips} inches` : ''}
        `.trim();
        
        const textPart = {
            text: `
**Primary Goal:** Create a hyper-realistic virtual try-on image by acting as a master digital artist and clothing simulation expert. Follow this strict, multi-step process with absolute precision.

**Step 1 (Highest Priority): Deep Biometric Analysis & 3D Body Profile Creation.**
Your first and most critical task is to perform a deep analysis of the three provided reference photos of ${profile.name} (front, side, and back views). Cross-reference them with the user-provided body profile below to construct a complete 3D understanding of their physique.
- **User-Provided Body Profile (Primary Truth):**
${userProvidedProfile}
- **Photo Analysis:** Analyze their unique body structure from the three distinct angles: shoulder-to-hip ratio, torso length, limb thickness (arms and legs), posture, body curvature, and overall body fat distribution. The three views are essential to create an accurate 3D model.

**Step 2: Accurate Body Reconstruction.**
Using the detailed biometric profile from Step 1, reconstruct a photorealistic, full-body model of ${profile.name}.
- The model's physique **must** be a direct and accurate representation of the user-provided profile and the 3-angle photo scan.
- Do not use a generic or idealized body shape. The generated body's proportions and build must perfectly match the analysis from Step 1.

**Step 3: Seamless Facial Integration.**
Once the accurate body has been reconstructed, integrate the face of ${profile.name} from the reference photos.
- **Identity Preservation:** Recreate the face with 100% fidelity. Do not alter facial structure or features.
- **Realistic Blending:** Analyze and replicate the lighting, shadows, and skin texture from the reference photos. The face must blend perfectly with the neck, and the lighting on the face must match the lighting of the overall scene.

**Step 4: Realistic Clothing Simulation.**
Finally, simulate how the provided clothing would realistically fit on the body you reconstructed in Step 2.
- Analyze the clothing's material, cut, and texture from its photo.
- Realistically render how it drapes, folds, stretches, and creases on the unique body shape.
- **Crucially, do not create an idealized or "perfect" fit.** If the item would be tight, loose, or unflattering in certain areas on this specific body, you must render it that way.

**Final Output:**
Combine the results into a single, cohesive, photorealistic image. The person should be in the requested **${selectedPose}** pose against a clean, minimalist, light gray studio background. The final image should be indistinguishable from a real photograph.
`
        };

        const parts = [clothingPart, ...personParts, textPart];

        try {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image-preview',
                contents: { parts },
                config: {
                    responseModalities: [Modality.IMAGE, Modality.TEXT],
                },
            });

            const imagePart = response.candidates?.[0]?.content?.parts?.find(part => part.inlineData);
            if (imagePart?.inlineData) {
                setResultImage(`data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`);
                changePage('result');
            } else {
                const textResponse = response.text || "No image was generated. The model may have refused the request due to safety policies. Please try a different set of images.";
                setError(`Failed to generate image. Response: ${textResponse}`);
                changePage('creator');
            }
        } catch (e: any) {
            console.error(e);
            setError(e.message || "An unexpected error occurred.");
            changePage('creator');
        }
    }, [clothingImage, profile, selectedPose]);
    
    const handleReset = useCallback(() => {
        setClothingImage(null);
        setSelectedPose('Standing Straight');
        setResultImage(null);
        setError(null);
        setIsSavingOutfit(false);
        setNewOutfitName("");
        setIsOutfitSaved(false);
        changePage('creator');
    }, []);

    const handleSaveOutfit = () => {
        if (!newOutfitName.trim() || !resultImage || !profile) return;
        
        const newOutfit: SavedOutfit = {
            id: `outfit_${Date.now()}`,
            name: newOutfitName,
            image: resultImage,
        };

        const updatedProfile: Profile = {
            ...profile,
            savedOutfits: [...(profile.savedOutfits || []), newOutfit],
        };

        setProfile(updatedProfile);
        localStorage.setItem('userProfile', JSON.stringify(updatedProfile));
        setIsOutfitSaved(true);
        setIsSavingOutfit(false);
    };
    
    const isScanComplete = profile?.bodyScans?.front && profile?.bodyScans?.side && profile?.bodyScans?.back;

    const renderPage = () => {
        switch (page) {
            case 'home':
                return (
                    <div className="page-container home-page">
                        <i className="material-icons icon">styler</i>
                        <h1>Welcome back, {profile?.name}!</h1>
                        <p>Virtually try on any outfit. Upload a photo of the clothing to create your new look.</p>
                        <div className="home-actions">
                            <button className="primary-button" onClick={() => changePage('creator')}>Create a New Look</button>
                            <button className="secondary-button" onClick={() => changePage('profile')}>View My Lookbook</button>
                        </div>
                    </div>
                );
            case 'profile':
                return <ProfilePage profile={profile} onSave={handleSaveProfile} setPage={changePage} />;
            case 'creator':
                const poses: Pose[] = ['Standing Straight', 'Slight 3/4 Turn', 'Hands on Hips', 'Walking Motion'];
                return (
                    <div className="creator-grid">
                        <div className="creator-preview-pane">
                            <div className="avatar-preview">
                                {profile?.bodyScans.front && (
                                    <img src={`data:${profile.bodyScans.front.mimeType};base64,${profile.bodyScans.front.b64}`} alt="Your silhouette" />
                                )}
                                <div className="avatar-overlay">Your Silhouette</div>
                            </div>
                        </div>
                        <div className="creator-controls-pane">
                            <div className="page-container creator-page">
                                <header className="page-header">
                                    <h2>Create Your Look</h2>
                                    <p>Follow the steps below to generate your image.</p>
                                </header>
                                <div className="step-card">
                                    <h3>Step 1: Upload Clothing</h3>
                                    <ImageUploader id="clothing-upload" onImageUpload={setClothingImage} image={clothingImage} title="Clothing Item" description="Drop a picture here" setError={setError} />
                                </div>
                                <div className="step-card">
                                    <h3>Step 2: Choose a Pose</h3>
                                    <div className="pose-selection-container">
                                        {poses.map(pose => (
                                            <button
                                                key={pose}
                                                className={`pose-button ${selectedPose === pose ? 'active' : ''}`}
                                                onClick={() => setSelectedPose(pose)}
                                            >
                                                {pose}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                {error && <div className="error-message" role="alert">{error}</div>}
                                <div className="action-panel">
                                    <button className="primary-button generate-button" onClick={handleGenerate} disabled={!clothingImage || !profile}>
                                        <i className="material-icons">auto_awesome</i>
                                        Generate
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            case 'loading':
                return (
                    <div className="page-container loading-section" aria-live="polite">
                        <h2>Crafting Your Look...</h2>
                        <div className="loader"></div>
                        <p className="loading-tip">{tip}</p>
                    </div>
                );
            case 'result':
                return (
                    <div className="page-container result-section">
                        <header className="page-header">
                          <h2>Here's Your New Look!</h2>
                        </header>
                        {resultImage && <img src={resultImage} alt="Generated outfit" className="result-image" />}
                        {isSavingOutfit ? (
                            <div className="save-outfit-form">
                                <input
                                    type="text"
                                    value={newOutfitName}
                                    onChange={(e) => setNewOutfitName(e.target.value)}
                                    placeholder="Name your outfit (e.g., Summer Casual)"
                                    aria-label="Outfit name"
                                    autoFocus
                                />
                                <div className="result-actions">
                                    <button className="secondary-button" onClick={() => setIsSavingOutfit(false)}>Cancel</button>
                                    <button className="primary-button" onClick={handleSaveOutfit} disabled={!newOutfitName.trim()}>Confirm Save</button>
                                </div>
                            </div>
                        ) : (
                            <div className="result-actions">
                                 <button className="secondary-button" onClick={handleReset}>Create New</button>
                                 <a href={resultImage!} download="virtual-try-on.png" className="secondary-button" style={{textDecoration: 'none', textAlign: 'center'}}>Download</a>
                                 <button 
                                    className="primary-button" 
                                    onClick={() => setIsSavingOutfit(true)}
                                    disabled={isOutfitSaved}
                                >
                                    {isOutfitSaved ? 'Saved!' : 'Add to Lookbook'}
                                </button>
                            </div>
                        )}
                    </div>
                );
        }
    };
    
    return (
        <>
            <Header page={page} setPage={changePage} />
            <main key={pageKey} className="page-transition">
                {renderPage()}
            </main>
        </>
    );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);