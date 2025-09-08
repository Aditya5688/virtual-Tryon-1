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

type SavedOutfit = {
    id: string;
    name: string;
    image: string; // data URL
};

type Profile = {
    name: string;
    faceImage: ImageFile | null;
    fullBodyImage: ImageFile | null;
    height: string;
    weight: string;
    bodyType?: BodyType;
    chest?: string;
    waist?: string;
    hips?: string;
    savedOutfits: SavedOutfit[];
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
    const [fullBodyImage, setFullBodyImage] = useState<ImageFile | null>(profile?.fullBodyImage || null);
    const [height, setHeight] = useState(profile?.height || '');
    const [weight, setWeight] = useState(profile?.weight || '');
    const [bodyType, setBodyType] = useState<BodyType | undefined>(profile?.bodyType);
    const [chest, setChest] = useState(profile?.chest || '');
    const [waist, setWaist] = useState(profile?.waist || '');
    const [hips, setHips] = useState(profile?.hips || '');
    const [savedOutfits, setSavedOutfits] = useState<SavedOutfit[]>(profile?.savedOutfits || []);
    const [localError, setLocalError] = useState<string | null>(null);

    const handleSave = () => {
        if (!name || !fullBodyImage || !height || !weight) {
            setLocalError('Please complete your name, measurements, and upload a full body photo.');
            return;
        }
        onSave({ name, faceImage, fullBodyImage, height, weight, bodyType, chest, waist, hips, savedOutfits });
        setPage('creator');
    };
    
    const handleDeleteOutfit = (idToDelete: string) => {
        const updatedOutfits = savedOutfits.filter(outfit => outfit.id !== idToDelete);
        setSavedOutfits(updatedOutfits);
        onSave({ name, faceImage, fullBodyImage, height, weight, bodyType, chest, waist, hips, savedOutfits: updatedOutfits });
    };

    const bodyTypes: { name: BodyType, icon: string }[] = [
        { name: 'Rectangle', icon: 'square_foot' },
        { name: 'Triangle', icon: 'change_history' },
        { name: 'Inverted Triangle', icon: 'change_history' },
        { name: 'Hourglass', icon: 'hourglass_empty' },
        { name: 'Round', icon: 'circle' }
    ];
    
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
                <h3>Your Full Body Photo</h3>
                <p className="description">A clear photo helps the AI understand your body shape and build.</p>
                <ImageUploader
                    id="full-body-upload"
                    onImageUpload={setFullBodyImage}
                    image={fullBodyImage}
                    title="Upload Full Body Photo"
                    description="Drop an image or click to browse"
                    setError={setLocalError}
                />
            </div>
            
             <div className="step-card">
                <h3>Body Shape & Measurements</h3>
                <p className="description">Providing these details helps the AI create a more accurate fit.</p>
                
                 <div className="body-type-header">
                     <h4>Body Type</h4>
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
        if (!profile || !clothingImage || !profile.fullBodyImage) {
            setError("Please complete your profile, including a full body photo, and upload a clothing image first.");
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
You are an expert AI fashion stylist and virtual try-on specialist. Your task is to generate a highly realistic image of a specific person wearing a piece of clothing.

**CRITICAL INSTRUCTIONS - Adhere to these strictly:**

**1. Analyze the User's Appearance (From Reference Images):**
- **Full Body Reference:** You are provided with a full-body photograph of the user. This is your primary reference for their exact body shape, build, and posture.
    - **Preserve Body Shape:** You MUST replicate their body shape and proportions precisely. Pay close attention to how slim or muscular they are. **DO NOT** make the person look more muscular, bulkier, or differently shaped than they appear in their photo. The goal is an accurate representation, not an idealized one.
- **Facial Reference:** ${profile.faceImage ? "You are also provided with a user's selfie." : "No selfie provided; generate a face that matches the person in the full body photo."}
    - **Preserve Facial Identity:** ${profile.faceImage ? "The face in the generated image MUST be a photorealistic match to the user's selfie. Do not alter their facial features, skin tone, or hairstyle. It must look like the same person." : ""}

**2. Analyze the Garment:**
- From the clothing image, identify the item's style, cut, color, and fabric type.

**3. Core Task: Generate a NEW Photorealistic Image**
- **DO NOT EDIT the original photos.** Your task is to **generate a completely new image from scratch.**
- Create a photorealistic "digital twin" of the user that is a perfect match to the references from step 1.
- Place this digital twin in a **'${selectedPose}'** pose.
- Realistically drape the provided garment onto this person. The fit, folds, and texture should be believable for their specific body shape.
- The final output must be a single, full-body, high-resolution image against a clean, neutral studio background. The image must be free of any text or watermarks.
- The pose and background of the final image must be different from the reference photos to prove it's a new generation.
`
            };
            
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image-preview',
                contents: {
                    parts: [
                        ...(profile.faceImage ? [{ inlineData: { data: profile.faceImage.b64, mimeType: profile.faceImage.mimeType } }] : []),
                        { inlineData: { data: profile.fullBodyImage.b64, mimeType: profile.fullBodyImage.mimeType } },
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