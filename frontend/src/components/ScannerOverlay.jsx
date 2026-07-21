import { useState, useEffect, useRef, useCallback } from 'react'
import Webcam from 'react-webcam'
import * as tf from '@tensorflow/tfjs'
import * as mobilenet from '@tensorflow-models/mobilenet'
import { Camera, X, Loader2, Search, Check, AlertCircle } from 'lucide-react'
import { mlApi } from '../services/api'
import TeachScannerModal from './TeachScannerModal'

export default function ScannerOverlay({ isOpen, onClose, onAddToCart, allProducts }) {
  const webcamRef = useRef(null)
  const [model, setModel] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  const [prediction, setPrediction] = useState(null) // { product, confidence }
  const [scanning, setScanning] = useState(false)
  
  const [showTeach, setShowTeach] = useState(false)
  const [currentVector, setCurrentVector] = useState(null)

  // 1. Load MobileNet Model on Mount
  useEffect(() => {
    let isMounted = true
    async function loadModel() {
      try {
        await tf.ready()
        const loadedModel = await mobilenet.load({ version: 2, alpha: 1.0 })
        if (isMounted) {
          setModel(loadedModel)
          setLoading(false)
        }
      } catch (err) {
        console.error("Failed to load ML model:", err)
        if (isMounted) {
          setError("Failed to load Image Recognition module.")
          setLoading(false)
        }
      }
    }
    if (isOpen && !model) {
      loadModel()
    }
    return () => { isMounted = false }
  }, [isOpen, model])

  // 2. Scan Loop
  const scanFrame = useCallback(async () => {
    if (!model || !webcamRef.current || showTeach || !isOpen) return

    const imageSrc = webcamRef.current.getScreenshot()
    if (!imageSrc) return

    try {
      setScanning(true)
      
      // Convert base64 to HTML image element to feed into tfjs
      const img = new Image()
      img.src = imageSrc
      await new Promise(resolve => { img.onload = resolve })

      // Extract embedding vector (infer with embedding=true)
      const embeddingTensor = model.infer(img, true)
      const vector = Array.from(embeddingTensor.dataSync())
      embeddingTensor.dispose() // prevent memory leaks

      // Send to backend
      const res = await mlApi.recognize(vector)
      setPrediction(res.data)
      setCurrentVector(vector)
    } catch (err) {
      console.error("Recognition error:", err)
    } finally {
      setScanning(false)
    }
  }, [model, showTeach, isOpen])

  // Run scan loop every 1.5 seconds
  useEffect(() => {
    if (!isOpen || !model || showTeach) return
    const interval = setInterval(scanFrame, 1500)
    return () => clearInterval(interval)
  }, [isOpen, model, scanFrame, showTeach])

  // Handle Enter to add
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen || showTeach) return
      if (e.key === 'Enter' && prediction?.product && prediction.confidence > 0.6) {
        onAddToCart(prediction.product)
      } else if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, showTeach, prediction, onAddToCart, onClose])

  if (!isOpen) return null

  const handleTeach = async (product) => {
    if (!currentVector) return
    await mlApi.teach(product.id, currentVector)
    // Clear current prediction to force re-scan
    setPrediction(null)
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm flex flex-col">
      {/* Header */}
      <div className="p-4 flex items-center justify-between border-b border-white/10">
        <div className="flex items-center gap-2 text-white">
          <Camera size={20} className="text-brand-400" />
          <h2 className="font-semibold text-lg">Smart Cart Scanner</h2>
          <span className="bg-brand-500/20 text-brand-300 text-xs px-2 py-0.5 rounded border border-brand-500/30">
            Beta
          </span>
        </div>
        <button onClick={onClose} className="p-2 text-white/50 hover:text-white rounded-xl hover:bg-white/10 transition-colors">
          <X size={24} />
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 relative">
        {loading ? (
          <div className="flex flex-col items-center gap-4 text-white/60">
            <Loader2 className="animate-spin text-brand-500" size={40} />
            <p>Loading AI Model...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-4 text-red-400">
            <AlertCircle size={40} />
            <p>{error}</p>
          </div>
        ) : (
          <div className="w-full max-w-2xl flex flex-col gap-6">
            {/* Camera View */}
            <div className="relative rounded-3xl overflow-hidden border-4 border-white/10 shadow-2xl bg-black aspect-video flex items-center justify-center">
              <Webcam
                ref={webcamRef}
                screenshotFormat="image/jpeg"
                videoConstraints={{ facingMode: "environment" }}
                className="w-full h-full object-cover"
              />
              
              {/* Scan Overlay UI */}
              <div className="absolute inset-0 border-2 border-brand-500/30 rounded-3xl pointer-events-none"></div>
              
              {/* Target Reticle */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 border-2 border-white/20 rounded-2xl flex items-center justify-center pointer-events-none">
                 <div className="w-1 h-4 bg-brand-500 absolute -top-2"></div>
                 <div className="w-1 h-4 bg-brand-500 absolute -bottom-2"></div>
                 <div className="w-4 h-1 bg-brand-500 absolute -left-2"></div>
                 <div className="w-4 h-1 bg-brand-500 absolute -right-2"></div>
              </div>
            </div>

            {/* Prediction Results Area */}
            <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-6 flex items-center justify-between">
              <div className="flex-1">
                {scanning && !prediction ? (
                  <div className="flex items-center gap-3 text-brand-300">
                    <Loader2 className="animate-spin" size={20} />
                    <p className="font-medium animate-pulse">Analyzing...</p>
                  </div>
                ) : prediction?.product && prediction.confidence >= 0.70 ? (
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-2xl font-bold text-white">{prediction.product.name}</h3>
                      <span className={`text-xs px-2 py-1 rounded font-bold ${prediction.confidence > 0.8 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>
                        {(prediction.confidence * 100).toFixed(1)}% Match
                      </span>
                    </div>
                    <p className="text-white/60 text-sm">Press <kbd className="bg-white/20 px-1.5 py-0.5 rounded text-white mx-1">Enter</kbd> to add to cart</p>
                  </div>
                ) : (
                  <div>
                    <h3 className="text-xl font-bold text-white/80">Unrecognized Item</h3>
                    <p className="text-white/50 text-sm">Position item in the center or teach the scanner.</p>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => setShowTeach(true)}
                  className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium transition-colors border border-white/10"
                >
                  <Search size={18} />
                  Teach
                </button>
                {prediction?.product && prediction.confidence > 0.5 && (
                  <button
                    onClick={() => onAddToCart(prediction.product)}
                    className="flex items-center gap-2 px-6 py-3 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-bold transition-all shadow-lg shadow-brand-500/30"
                  >
                    <Check size={18} />
                    Add to Cart
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <TeachScannerModal
        isOpen={showTeach}
        onClose={() => setShowTeach(false)}
        allProducts={allProducts}
        onTeach={handleTeach}
        currentFrame={currentVector}
      />
    </div>
  )
}
