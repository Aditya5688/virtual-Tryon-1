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
type SavedOutfit = {
    id: string;
    name: string;
    image: string; // data URL
};
type Profile = {
    name: string;
    photos: ImageFile[];
    height: string;
    weight: string;
    savedOutfits: SavedOutfit[];
};

// Camera Capture Component
const CameraCapture = ({ onCapture, onClose, setError }: {
    onCapture: (file: ImageFile) => void;
    onClose: () => void;
    setError: (error: string | null) => void;
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

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
        };
    }, [onClose, setError]);

    const handleCapture = () => {
        if (!videoRef.current) return;
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        const context = canvas.getContext('2d');
        if (context) {
            context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg');
            const base64 = dataUrl.split(',')[1];
            onCapture({ b64: base64, mimeType: 'image/jpeg' });
        }
        onClose();
    };

    return (
        <div className="camera-modal-overlay" onClick={onClose}>
            <div className="camera-modal-content" onClick={(e) => e.stopPropagation()}>
                <video ref={videoRef} autoPlay playsInline className="camera-video-feed"></video>
                <button className="capture-button" onClick={handleCapture} aria-label="Take Photo">
                    <i className="material-icons">camera</i>
                </button>
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

// Helper for multi-image upload
const MultiImageUploader = ({ onImagesUpload, images, setError, onTakePhoto }: {
    onImagesUpload: (data: ImageFile[]) => void;
    images: ImageFile[];
    setError: (error: string | null) => void;
    onTakePhoto: () => void;
}) => {
    const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
        event.preventDefault();
        setError(null);
        const files = event.target.files;
        if (files && files.length > 0) {
            const file = files[0];
            if (!file.type.startsWith('image/')) {
                setError('Invalid file type. Please upload an image.');
                return;
            }
            if (images.length >= 3) {
                setError('You can upload a maximum of 3 photos.');
                return;
            }
            const base64 = await fileToBase64(file);
            onImagesUpload([...images, { b64: base64, mimeType: file.type }]);
        }
    }, [images, onImagesUpload, setError]);

    const handleRemoveImage = (indexToRemove: number) => {
        onImagesUpload(images.filter((_, index) => index !== indexToRemove));
    };

    return (
        <>
            <input type="file" id="person-multi-upload" style={{ display: 'none' }} onChange={handleFileChange} accept="image/*" multiple={false} />
            <div className="multi-upload-grid">
                {images.map((img, index) => (
                    <div key={index} className="image-thumbnail">
                        <img src={`data:${img.mimeType};base64,${img.b64}`} alt={`Person reference ${index + 1}`} />
                        <button className="remove-image-button" onClick={() => handleRemoveImage(index)} aria-label={`Remove image ${index + 1}`}>&times;</button>
                    </div>
                ))}
                {images.length < 3 && (
                    <div className="uploader-actions">
                         <label htmlFor="person-multi-upload" className="add-image-box">
                            <i className="material-icons">add_photo_alternate</i>
                        </label>
                        <button onClick={onTakePhoto} className="add-image-box camera-button" aria-label="Take a photo">
                             <i className="material-icons">photo_camera</i>
                        </button>
                    </div>
                )}
            </div>
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
    const [photos, setPhotos] = useState<ImageFile[]>(profile?.photos || []);
    const [height, setHeight] = useState(profile?.height || '');
    const [weight, setWeight] = useState(profile?.weight || '');
    const [savedOutfits, setSavedOutfits] = useState<SavedOutfit[]>(profile?.savedOutfits || []);
    const [localError, setLocalError] = useState<string | null>(null);
    const [isCameraOpen, setIsCameraOpen] = useState(false);

    const handleSave = () => {
        if (!name || photos.length === 0 || !height || !weight) {
            setLocalError('Please fill out all fields and upload at least one photo.');
            return;
        }
        onSave({ name, photos, height, weight, savedOutfits });
    };

    const handleCapture = (newPhoto: ImageFile) => {
        if (photos.length < 3) {
            setPhotos([...photos, newPhoto]);
        } else {
            setLocalError('You can upload a maximum of 3 photos.');
        }
    };
    
    const handleDeleteOutfit = (idToDelete: string) => {
        setSavedOutfits(savedOutfits.filter(outfit => outfit.id !== idToDelete));
    };


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
                <h3>Your Photos & Details</h3>
                <p className="description" style={{ color: 'var(--secondary-text)', fontSize: '0.9rem', textAlign: 'center', marginBottom: '1rem' }}>Add up to 3 photos for best results.</p>
                <MultiImageUploader images={photos} onImagesUpload={setPhotos} setError={setLocalError} onTakePhoto={() => setIsCameraOpen(true)} />
                <div className="details-inputs">
                    <div className="input-group">
                        <label htmlFor="height">Height (feet)</label>
                        <input id="height" type="number" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="e.g., 5.8" aria-label="Height in feet" />
                    </div>
                    <div className="input-group">
                        <label htmlFor="weight">Weight (kg)</label>
                        <input id="weight" type="number" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="e.g., 70" aria-label="Weight in kilograms" />
                    </div>
                </div>
            </div>

            {savedOutfits.length > 0 && (
                <div className="step-card">
                    <h3>Saved Outfits</h3>
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

             {isCameraOpen && <CameraCapture onCapture={handleCapture} onClose={() => setIsCameraOpen(false)} setError={setLocalError} />}

            <div className="action-panel">
                <button className="primary-button" onClick={handleSave}>Save Profile</button>
                {profile && <button className="secondary-button" onClick={() => setPage('creator')}>Cancel</button>}
            </div>
        </div>
    );
};


const App = () => {
    const [page, setPage] = useState<Page>('loading');
    const [profile, setProfile] = useState<Profile | null>(null);
    const [clothingImage, setClothingImage] = useState<ImageFile | null>(null);
    const [selectedPose, setSelectedPose] = useState<Pose>('Standing Straight');
    const [resultImage, setResultImage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isSavingOutfit, setIsSavingOutfit] = useState(false);
    const [newOutfitName, setNewOutfitName] = useState("");
    const [isOutfitSaved, setIsOutfitSaved] = useState(false);
    
    useEffect(() => {
        const savedProfileJSON = localStorage.getItem('userProfile');
        if (savedProfileJSON) {
            const savedProfile = JSON.parse(savedProfileJSON);
            // Backwards compatibility for profiles without savedOutfits
            if (!savedProfile.savedOutfits) {
                savedProfile.savedOutfits = [];
            }
            setProfile(savedProfile);
            setPage('home');
        } else {
            setPage('profile');
        }
    }, []);

    const handleSaveProfile = (newProfile: Profile) => {
        setProfile(newProfile);
        localStorage.setItem('userProfile', JSON.stringify(newProfile));
        setPage('creator');
    };

    const handleGenerate = useCallback(async () => {
        if (!clothingImage || !profile) {
            setError("Please upload a clothing item and ensure your profile is complete.");
            return;
        }

        setPage('loading');
        setError(null);
        setResultImage(null);
        
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

        const clothingPart = { inlineData: { data: clothingImage.b64, mimeType: clothingImage.mimeType } };
        const personParts = profile.photos.map(img => ({ inlineData: { data: img.b64, mimeType: img.mimeType } }));
        const textPart = {
            text: `
**Primary Goal:** Create a hyper-realistic virtual try-on image by acting as a master digital artist and clothing simulation expert. Follow this strict, multi-step process with absolute precision.

**Step 1 (Highest Priority): Deep Biometric Analysis & Body Profile Creation.**
Your first and most critical task is to perform a deep analysis of all provided reference photos of ${profile.name}.
- Analyze their unique body structure: shoulder-to-hip ratio, torso length, limb thickness (arms and legs), posture, and overall body fat distribution.
- From this analysis, create a detailed "biometric profile" that serves as the blueprint for the next step. This is not a generic assessment; it is a specific analysis of the person in the photos.

**Step 2: Accurate Body Reconstruction.**
Using the detailed biometric profile from Step 1, reconstruct a photorealistic, full-body model of ${profile.name}.
- The model's physique **must** be a direct and accurate representation of the visual information from the reference photos, further refined by the provided dimensions: ${profile.height} feet tall and ${profile.weight} kilograms.
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
                setPage('result');
            } else {
                const textResponse = response.text || "No image was generated. The model may have refused the request due to safety policies. Please try a different set of images.";
                setError(`Failed to generate image. Response: ${textResponse}`);
                setPage('creator');
            }
        } catch (e: any) {
            console.error(e);
            setError(e.message || "An unexpected error occurred.");
            setPage('creator');
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
        setPage('home');
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

    const renderPage = () => {
        switch (page) {
            case 'home':
                return (
                    <div className="page-container home-page">
                        <i className="material-icons icon">styler</i>
                        <h1>AI Fashion Studio</h1>
                        <p>Welcome back, {profile?.name}! Virtually try on any outfit. Upload a photo of the clothing to create your new look.</p>
                        <button className="primary-button" onClick={() => setPage('creator')}>Get Started</button>
                    </div>
                );
            case 'profile':
                return <ProfilePage profile={profile} onSave={handleSaveProfile} setPage={setPage} />;
            case 'creator':
                const poses: Pose[] = ['Standing Straight', 'Slight 3/4 Turn', 'Hands on Hips', 'Walking Motion'];
                return (
                    <div className="page-container">
                        <header className="page-header">
                            <h2>Create Your Look</h2>
                            <p>Hello, {profile?.name}! Follow the steps below to generate your image.</p>
                        </header>
                         <div className="step-card">
                            <h3>Profile Summary</h3>
                            <div className="profile-summary">
                                <span><i className="material-icons">badge</i> {profile?.name}</span>
                                <span><i className="material-icons">straighten</i> {profile?.height} ft</span>
                                <span><i className="material-icons">monitor_weight</i> {profile?.weight} kg</span>
                            </div>
                            <button className="secondary-button" onClick={() => setPage('profile')}>Manage Profile</button>
                        </div>
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
                            <button className="primary-button" onClick={handleGenerate} disabled={!clothingImage || !profile}>
                                Generate
                            </button>
                        </div>
                    </div>
                );
            case 'loading':
                return (
                    <div className="page-container loading-section" aria-live="polite">
                        <h2>Crafting Your Look...</h2>
                        <div className="loader"></div>
                        <p>The AI is building your avatar. This may take a moment.</p>
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
                                <button className="primary-button" onClick={handleSaveOutfit} disabled={!newOutfitName.trim()}>Confirm Save</button>
                                <button className="secondary-button" onClick={() => setIsSavingOutfit(false)}>Cancel</button>
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
                                    {isOutfitSaved ? 'Saved!' : 'Save Outfit'}
                                </button>
                            </div>
                        )}
                    </div>
                );
        }
    };
    
    return (
        <>
            {renderPage()}
        </>
    );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);