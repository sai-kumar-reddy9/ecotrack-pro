import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Leaf, LayoutDashboard, Calculator as CalculatorIcon, Info, LogOut, Car, Zap, Plane, 
  Trash2, User, ArrowRight, Activity, Globe, Menu, X, Settings, 
  TrendingUp, Award, Save, Sparkles, Bot, Loader2, CheckCircle, XCircle, AlertTriangle, Send, Bike, Lock
} from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area 
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';

// --- FIREBASE IMPORTS ---
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  onAuthStateChanged, 
  updateProfile, 
  signOut 
} from 'firebase/auth';
import { 
  getFirestore, collection, addDoc, query, onSnapshot, orderBy, deleteDoc, doc, serverTimestamp, where 
} from 'firebase/firestore';

// --- 1. CONFIGURATION ---

//  YOUR FIREBASE CONFIG (Keep this safe!)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: "co2-tracker-a4b64.firebaseapp.com",
  projectId: "co2-tracker-a4b64",
  storageBucket: "co2-tracker-a4b64.firebasestorage.app",
  messagingSenderId: "661946995152",
  appId: "1:661946995152:web:5e460926522d7aa1a069d5"
};

// Initialize Firebase
let app, auth, db;
try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
} catch (e) {
  console.error("Firebase initialization error:", e);
}

const appId = 'eco-tracker-prod-v1';

// Defaults

const SYSTEM_CARBON_KEY = import.meta.env.VITE_CARBON_API_KEY;
const SYSTEM_GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const COLORS = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444'];

// Images
// const IMAGES = {
//     hero: "https://images.unsplash.com/photo-1473448912268-2022ce9509d8?q=80&w=2041&auto=format&fit=crop",
//     login: "https://images.unsplash.com/photo-1497436072909-60f360e1d4b0?q=80&w=2560&auto=format&fit=crop",
//     car: "https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?auto=format&fit=crop&w=800&q=80",
//     bike: "https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&w=800&q=80",
//     plane: "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=800&q=80",
//     energy: "https://images.unsplash.com/photo-1473341304170-5799fa654d25?auto=format&fit=crop&w=800&q=80"
// };
import heroImg from "./assets/flight.png";
import loginImg from "./assets/house.png";
import carImg from "./assets/car2.jpg";
import bikeImg from "./assets/bike.png";
import planeImg from "./assets/flight2.png";
import energyImg from "./assets/house.png";

const IMAGES = {
  hero: heroImg,
  login: loginImg,
  transport : carImg,
  bike: bikeImg,
  flights : planeImg,
  energy: energyImg
};


// --- 2. SERVICES ---

const CarbonAPI = {
  baseUrl: 'https://www.carboninterface.com/api/v1',
  getKey: () => localStorage.getItem('user_carbon_key') || SYSTEM_CARBON_KEY,
  headers: () => ({ 'Authorization': `Bearer ${CarbonAPI.getKey()}`, 'Content-Type': 'application/json' }),

  getVehicleMakes: async () => {
    try {
      const res = await fetch(`${CarbonAPI.baseUrl}/vehicle_makes`, { headers: CarbonAPI.headers() });
      if(!res.ok) throw new Error('Failed');
      return await res.json();
    } catch { return []; }
  },
  getVehicleModels: async (makeId) => {
    try {
      const res = await fetch(`${CarbonAPI.baseUrl}/vehicle_makes/${makeId}/vehicle_models`, { headers: CarbonAPI.headers() });
      if(!res.ok) throw new Error('Failed');
      return await res.json();
    } catch { return []; }
  },
  estimateVehicle: async (vehicleModelId, distance, unit) => {
    try {
      const res = await fetch(`${CarbonAPI.baseUrl}/estimates`, {
        method: 'POST', headers: CarbonAPI.headers(),
        body: JSON.stringify({ type: 'vehicle', distance_unit: unit, distance_value: parseFloat(distance), vehicle_model_id: vehicleModelId })
      });
      const data = await res.json();
      return data.data.attributes.carbon_kg;
    } catch { return 0; } 
  },
  estimateFlight: async (passengers, legs, distanceUnit = 'km') => {
    try {
      const res = await fetch(`${CarbonAPI.baseUrl}/estimates`, {
        method: 'POST', headers: CarbonAPI.headers(),
        body: JSON.stringify({ type: 'flight', passengers: parseInt(passengers), legs: legs, distance_unit: distanceUnit })
      });
      const data = await res.json();
      return data.data.attributes.carbon_kg;
    } catch { return 0; }
  },
  estimateBike: (cc, distance, unit) => {
    const distKm = unit === 'mi' ? distance * 1.60934 : parseFloat(distance);
    let factor = 0.08; // Default low cc
    if (cc === 'medium') factor = 0.10;
    if (cc === 'high') factor = 0.14;
    return distKm * factor;
  },
  estimateElectricity: (usage) => parseFloat(usage) * 0.4
};

const GeminiService = {
  getKey: () => localStorage.getItem('user_gemini_key') || SYSTEM_GEMINI_KEY,
  generateContent: async (prompt) => {
    const apiKey = GeminiService.getKey();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || "AI could not generate a response.";
    } catch (error) {
        throw new Error("Failed to connect to Gemini.");
    }
  },
  getAnalysisPrompt: (data) => {
    const summary = data.slice(0, 15).map(d => `${d.category}: ${d.co2}kg`).join(', ');
    return `Analyze these carbon footprint logs: [${summary}]. Identify the biggest source and give 3 reduction tips. Use markdown.`;
  }
};

// --- 3. COMPONENTS ---

const Notification = ({ message, type }) => (
  <motion.div initial={{ opacity: 0, y: -50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -50 }} className={`fixed top-24 right-4 z-50 px-6 py-4 rounded-xl shadow-2xl backdrop-blur-md border flex items-center gap-3 ${type === 'success' ? 'bg-emerald-100/90 border-emerald-200 text-emerald-800' : 'bg-red-100/90 border-red-200 text-red-800'}`}>
    {type === 'success' ? <Sparkles size={20} /> : <Info size={20} />}
    <div className="font-medium">{message}</div>
  </motion.div>
);

const Navbar = ({ user, setView, currentView, handleLogout }) => {
  const [isOpen, setIsOpen] = useState(false);
  const NavBtn = ({ view, icon: Icon, label, locked }) => (
    <button onClick={() => { if(locked && !user) { alert("Please login to access this feature!"); setView('auth'); } else { setView(view); setIsOpen(false); } }} className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-all relative ${currentView === view ? 'bg-emerald-600 text-white shadow-lg' : 'text-gray-600 hover:bg-emerald-50'}`}>
      <Icon size={18} /> <span>{label}</span>
      {locked && !user && <Lock size={12} className="absolute top-2 right-2 text-gray-400" />}
    </button>
  );

  return (
    <nav className="bg-white/90 backdrop-blur-xl shadow-sm sticky top-0 z-50 border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-20">
          <div className="flex items-center cursor-pointer" onClick={() => setView('landing')}>
            <div className="bg-gradient-to-br from-emerald-400 to-teal-500 p-2.5 rounded-xl mr-3 shadow-md"><Leaf className="h-6 w-6 text-white" /></div>
            <span className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-800 to-gray-600">EcoTrack</span>
          </div>
          <div className="hidden md:flex items-center space-x-2">
            <NavBtn view="landing" icon={Globe} label="Home" />
            <NavBtn view="calculate" icon={CalculatorIcon} label="Calculate" />
            <NavBtn view="about" icon={Info} label="About" />
            <div className="h-6 w-px bg-gray-200 mx-2" />
            <NavBtn view="dashboard" icon={LayoutDashboard} label="Dashboard" locked={true} />
            <NavBtn view="eco-assistant" icon={Bot} label="Ask AI" locked={true} />
            
            {user ? (
                <div className="flex items-center gap-3 pl-2 ml-2 border-l border-gray-200">
                    <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-sm shadow-inner border border-emerald-200">
                        {user.displayName ? user.displayName.charAt(0).toUpperCase() : 'U'}
                    </div>
                    <button onClick={handleLogout} className="text-gray-400 hover:text-red-500 transition-colors" title="Logout"><LogOut size={20} /></button>
                </div>
            ) : (
              <button onClick={() => setView('auth')} className="ml-4 bg-gray-900 text-white px-6 py-2.5 rounded-full hover:bg-gray-800 transition-all font-medium shadow-lg text-sm">Login</button>
            )}
          </div>
          <div className="md:hidden flex items-center">
            <button onClick={() => setIsOpen(!isOpen)} className="text-gray-600 p-2">{isOpen ? <X size={24} /> : <Menu size={24} />}</button>
          </div>
        </div>
      </div>
      <AnimatePresence>
        {isOpen && (
          <motion.div initial={{height:0, opacity:0}} animate={{height:'auto', opacity:1}} exit={{height:0, opacity:0}} className="md:hidden bg-white border-t overflow-hidden shadow-lg">
             <div className="p-4 space-y-2">
                 <button onClick={() => { setView('calculate'); setIsOpen(false); }} className="w-full p-3 text-left hover:bg-gray-50 rounded-lg">Calculate</button>
                 {user ? (
                     <>
                        <button onClick={() => { setView('dashboard'); setIsOpen(false); }} className="w-full p-3 text-left hover:bg-gray-50 rounded-lg">Dashboard</button>
                        <button onClick={() => { setView('eco-assistant'); setIsOpen(false); }} className="w-full p-3 text-left hover:bg-gray-50 rounded-lg">Ask AI</button>
                        <button onClick={handleLogout} className="w-full p-3 text-left text-red-600 hover:bg-red-50 rounded-lg font-bold">Logout</button>
                     </>
                 ) : (
                     <button onClick={() => { setView('auth'); setIsOpen(false); }} className="w-full p-3 bg-emerald-600 text-white rounded-lg font-bold">Login / Register</button>
                 )}
             </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

const AuthPage = ({ setUser, setView }) => {
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    if (!auth) { setError("Firebase not configured."); setLoading(false); return; }

    try {
      let userCred;
      if (isRegister) {
          userCred = await createUserWithEmailAndPassword(auth, email, password);
          if(name) await updateProfile(userCred.user, { displayName: name });
      } else {
          userCred = await signInWithEmailAndPassword(auth, email, password);
      }
      // Auth state listener in App will handle redirect
    } catch (err) {
      console.error(err);
      setError(err.message.replace("Firebase: ", ""));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-80px)] flex items-center justify-center px-4 relative overflow-hidden bg-gray-50">
      <img src={IMAGES.login} className="absolute inset-0 w-full h-full object-cover opacity-10" alt="nature background" />
      
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white/90 backdrop-blur-xl p-8 rounded-3xl shadow-2xl w-full max-w-md border border-white relative z-10">
        <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-gray-900">{isRegister ? 'Create Account' : 'Welcome Back'}</h2>
            <p className="text-gray-500 mt-2">{isRegister ? 'Join the sustainable revolution' : 'Continue your eco-journey'}</p>
        </div>
        
        {error && <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-xl border border-red-100 flex items-center"><AlertTriangle size={16} className="mr-2"/> {error}</div>}
        
        <form onSubmit={handleSubmit} className="space-y-5">
          {isRegister && (
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name</label>
                <input type="text" required value={name} onChange={e => setName(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="John Doe" />
            </div>
          )}
          <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email Address</label>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="you@example.com" />
          </div>
          <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
              <input type="password" required value={password} onChange={e => setPassword(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="••••••••" />
          </div>
          
          <button disabled={loading} className="w-full bg-gray-900 text-white py-4 rounded-xl font-bold hover:bg-gray-800 transition-all shadow-lg disabled:opacity-70 flex justify-center">
              {loading ? <Loader2 className="animate-spin" /> : (isRegister ? 'Sign Up' : 'Login')}
          </button>
        </form>

        <div className="mt-8 text-center">
            <p className="text-gray-500 text-sm">
                {isRegister ? "Already have an account?" : "New to EcoTrack?"} 
                <button onClick={() => setIsRegister(!isRegister)} className="ml-2 text-emerald-600 font-bold hover:underline">
                    {isRegister ? "Login" : "Register"}
                </button>
            </p>
        </div>
      </motion.div>
    </div>
  );
};

const CalculatorPage = ({ user, setNotification, setView }) => {
  const [activeTab, setActiveTab] = useState('transport');
  const [loading, setLoading] = useState(false);
  
  const [makes, setMakes] = useState([]);
  const [models, setModels] = useState([]);
  const [selectedMake, setSelectedMake] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  
  const [distance, setDistance] = useState('');
  const [distanceUnit, setDistanceUnit] = useState('km');
  const [passengers, setPassengers] = useState(1);
  const [airportSource, setAirportSource] = useState('');
  const [airportDest, setAirportDest] = useState('');
  const [bikeCC, setBikeCC] = useState('low');
  const [electricity, setElectricity] = useState('');

  useEffect(() => {
    if (activeTab === 'transport') {
      setLoading(true);
      CarbonAPI.getVehicleMakes().then(data => {
        if(Array.isArray(data)) setMakes(data.sort((a,b) => a.data.attributes.name.localeCompare(b.data.attributes.name)));
        else setMakes([]); 
        setLoading(false);
      });
    }
  }, [activeTab]);

  useEffect(() => {
    if (selectedMake) {
      setLoading(true);
      CarbonAPI.getVehicleModels(selectedMake).then(data => {
        setModels(Array.isArray(data) ? data : []);
        setLoading(false);
      });
    }
  }, [selectedMake]);

  const handleCalculate = async () => {
    if (!user) {
        // Not logged in behavior
        alert("You are currently in Guest Mode. Please Login to save this calculation to your dashboard and get AI insights.");
        setView('auth');
        return;
    }

    setLoading(true);
    let co2 = 0;
    let category = activeTab;
    let details = '';

    try {
      if (activeTab === 'transport') {
        if (selectedModel) {
             const result = await CarbonAPI.estimateVehicle(selectedModel, distance, distanceUnit);
             if (result === 0) throw new Error("API Error");
             co2 = result;
             const modelName = models.find(m => m.data.id === selectedModel)?.data.attributes.name || 'Car';
             details = `${modelName} (${distance} ${distanceUnit})`;
        } else {
           const km = distanceUnit === 'mi' ? distance * 1.60934 : distance;
           co2 = km * 0.192;
           details = `Car (Est.) - ${distance} ${distanceUnit}`;
        }
      } 
      else if (activeTab === 'bike') {
         co2 = CarbonAPI.estimateBike(bikeCC, distance, distanceUnit);
         const type = bikeCC === 'low' ? '<150cc' : bikeCC === 'medium' ? '150-500cc' : '>500cc';
         details = `Motorbike (${type}) - ${distance} ${distanceUnit}`;
      }
      else if (activeTab === 'flights') {
        const legs = [{ source_airport_code: airportSource, destination_airport_code: airportDest }];
        const result = await CarbonAPI.estimateFlight(passengers, legs, distanceUnit);
        if (result === 0) {
            co2 = 250 * parseInt(passengers);
            details = `Flight (Est.) ${airportSource}->${airportDest}`;
        } else {
            co2 = result;
            details = `Flight: ${airportSource} -> ${airportDest}`;
        }
      } else {
        co2 = CarbonAPI.estimateElectricity(electricity);
        details = `Electricity: ${electricity} kWh`;
      }

      if(db && user) {
        await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'footprint'), {
            category, co2: parseFloat(co2), details, date: serverTimestamp(), rawDate: Date.now()
        });
      }

      setNotification({ message: `Success! Added ${co2.toFixed(1)} kg CO2`, type: 'success' });
      setDistance(''); setElectricity(''); 
    } catch (err) {
      setNotification({ message: 'Calculation failed. Used fallback.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const TabButton = ({ id, icon: Icon, label }) => (
    <button onClick={() => setActiveTab(id)} className={`flex-1 py-4 flex flex-col items-center justify-center rounded-2xl transition-all duration-300 border ${activeTab === id ? 'bg-emerald-50 border-emerald-200 text-emerald-700 shadow-sm' : 'bg-white border-gray-100 text-gray-500 hover:bg-gray-50'}`}>
      <Icon size={24} className="mb-2" strokeWidth={1.5} /> <span className="text-sm font-medium">{label}</span>
    </button>
  );

  return (
    <div className="max-w-4xl mx-auto py-10 px-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8 text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">Calculate Your Impact</h1>
        <p className="text-gray-500">Choose an activity below to get started.</p>
      </motion.div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <TabButton id="transport" icon={Car} label="Car" />
        <TabButton id="bike" icon={Bike} label="Motorbike" />
        <TabButton id="flights" icon={Plane} label="Flight" />
        <TabButton id="energy" icon={Zap} label="Energy" />
      </div>

      <motion.div key={activeTab} initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden flex flex-col md:flex-row">
        {/* Image Section */}
        <div className="w-full md:w-1/3 h-48 md:h-auto bg-gray-100 relative">
             <img 
               src={IMAGES[activeTab] || IMAGES.hero} 
               className="absolute inset-0 w-full h-full object-cover" 
               alt="activity"
             />
             <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent flex items-end p-6">
                 <h3 className="text-white font-bold text-xl capitalize">{activeTab}</h3>
             </div>
        </div>

        {/* Form Section */}
        <div className="flex-1 p-8">
            {activeTab === 'transport' && (
            <div className="space-y-6">
                <div className="grid md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Make</label>
                    <select className="w-full p-4 bg-gray-50 rounded-xl border-none ring-1 ring-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none" onChange={e => setSelectedMake(e.target.value)}>
                    <option value="">Select Make</option>
                    {makes.map(m => <option key={m.data.id} value={m.data.id}>{m.data.attributes.name}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Model</label>
                    <select className="w-full p-4 bg-gray-50 rounded-xl border-none ring-1 ring-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none" onChange={e => setSelectedModel(e.target.value)} disabled={!selectedMake}>
                    <option value="">{loading ? 'Loading...' : 'Select Model'}</option>
                    {models.map(m => <option key={m.data.id} value={m.data.id}>{m.data.attributes.name} {m.data.attributes.year}</option>)}
                    </select>
                </div>
                </div>
                <div className="flex gap-4">
                <input type="number" value={distance} onChange={e => setDistance(e.target.value)} className="w-full p-4 bg-gray-50 rounded-xl border-none ring-1 ring-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="Distance" />
                <select value={distanceUnit} onChange={e => setDistanceUnit(e.target.value)} className="w-32 p-4 bg-gray-50 rounded-xl border-none ring-1 ring-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none">
                    <option value="km">km</option>
                    <option value="mi">mi</option>
                </select>
                </div>
            </div>
            )}

            {activeTab === 'bike' && (
            <div className="space-y-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Engine Size</label>
                    <div className="grid grid-cols-3 gap-3">
                        {['low', 'medium', 'high'].map(type => (
                            <button key={type} onClick={() => setBikeCC(type)} className={`py-3 rounded-xl text-sm font-medium border ${bikeCC === type ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                                {type === 'low' ? '< 150cc' : type === 'medium' ? '150-500cc' : '> 500cc'}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="flex gap-4">
                <input type="number" value={distance} onChange={e => setDistance(e.target.value)} className="w-full p-4 bg-gray-50 rounded-xl border-none ring-1 ring-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="Distance" />
                <select value={distanceUnit} onChange={e => setDistanceUnit(e.target.value)} className="w-32 p-4 bg-gray-50 rounded-xl border-none ring-1 ring-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none">
                    <option value="km">km</option>
                    <option value="mi">mi</option>
                </select>
                </div>
            </div>
            )}

            {activeTab === 'flights' && (
            <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                <input type="text" value={airportSource} onChange={e => setAirportSource(e.target.value.toUpperCase())} className="w-full p-4 bg-gray-50 rounded-xl border-none ring-1 ring-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="From (IATA)" maxLength={3}/>
                <input type="text" value={airportDest} onChange={e => setAirportDest(e.target.value.toUpperCase())} className="w-full p-4 bg-gray-50 rounded-xl border-none ring-1 ring-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="To (IATA)" maxLength={3}/>
                </div>
                <input type="number" value={passengers} onChange={e => setPassengers(e.target.value)} className="w-full p-4 bg-gray-50 rounded-xl border-none ring-1 ring-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="Passengers" min="1"/>
            </div>
            )}

            {activeTab === 'energy' && (
            <div className="space-y-6">
                <input type="number" value={electricity} onChange={e => setElectricity(e.target.value)} className="w-full p-4 bg-gray-50 rounded-xl border-none ring-1 ring-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="Electricity Usage (kWh)" />
            </div>
            )}

            <button onClick={handleCalculate} disabled={loading} className="w-full mt-8 bg-gray-900 text-white py-4 rounded-xl font-bold hover:bg-gray-800 flex justify-center items-center shadow-lg transition-transform hover:scale-[1.02]">
                {loading ? <Loader2 className="animate-spin" /> : (user ? 'Save to Dashboard' : 'Calculate (Login to Save)')}
            </button>
        </div>
      </motion.div>
    </div>
  );
};

const DashboardPage = ({ user, setNotification }) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    if (!user || !db) return;
    const q = query(
      collection(db, 'artifacts', appId, 'users', user.uid, 'footprint'),
      orderBy('date', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      setData(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, [user]);

  const handleAnalyze = async () => {
      setIsAnalyzing(true);
      try {
          const prompt = GeminiService.getAnalysisPrompt(data);
          const response = await GeminiService.generateContent(prompt);
          setAiAnalysis(response);
      } catch (e) {
          setNotification({ message: "AI Analysis failed. Check Internet/Key.", type: "error" });
      } finally {
          setIsAnalyzing(false);
      }
  };

  const totalCO2 = data.reduce((sum, item) => sum + item.co2, 0);
  
  const chartData = useMemo(() => {
    const grouped = {};
    data.slice().reverse().forEach(item => {
        const d = new Date(item.rawDate).toLocaleDateString('en-US', {month:'short', day:'numeric'});
        grouped[d] = (grouped[d] || 0) + item.co2;
    });
    return Object.keys(grouped).map(k => ({ date: k, co2: grouped[k] }));
  }, [data]);

  if (loading) return <div className="flex justify-center h-96 items-center"><Loader2 className="animate-spin text-emerald-600" /></div>;

  return (
    <div className="max-w-7xl mx-auto py-8 px-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-3xl p-8 text-white shadow-xl">
            <p className="text-emerald-100 font-medium uppercase tracking-wider text-sm">Total Footprint</p>
            <h2 className="text-5xl font-bold mt-2">{totalCO2.toFixed(1)}<span className="text-2xl font-normal ml-1 opacity-80">kg</span></h2>
            <div className="mt-6 bg-white/20 h-1.5 rounded-full overflow-hidden">
                <motion.div initial={{width: 0}} animate={{width: '60%'}} className="h-full bg-white" />
            </div>
            <p className="text-xs text-emerald-100 mt-2">Based on your logged activity</p>
        </div>
        <div className="col-span-2 bg-white rounded-3xl p-8 shadow-sm border border-gray-100 flex flex-col">
            <div className="flex justify-between items-start mb-4">
                <div>
                    <h3 className="font-bold text-gray-800 text-lg flex items-center gap-2"><Sparkles size={18} className="text-purple-500"/> AI Insights</h3>
                    <p className="text-gray-400 text-sm">Personalized analysis powered by Gemini</p>
                </div>
                <button onClick={handleAnalyze} disabled={isAnalyzing} className="text-indigo-600 bg-indigo-50 px-4 py-2 rounded-full text-sm font-bold flex items-center hover:bg-indigo-100 transition-all">
                   {isAnalyzing ? <Loader2 className="animate-spin mr-2" size={16}/> : 'Generate Report'}
                </button>
            </div>
            <div className="flex-1 overflow-y-auto max-h-32 pr-2 scrollbar-thin">
                {aiAnalysis ? <div className="prose prose-sm prose-indigo"><ReactMarkdown>{aiAnalysis}</ReactMarkdown></div> : <div className="flex items-center justify-center h-full text-gray-300 text-sm italic">Analysis will appear here...</div>}
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 bg-white rounded-3xl p-6 shadow-sm border border-gray-100 h-80">
             <h3 className="font-bold text-gray-800 mb-4 ml-2">Emission Trend</h3>
             <ResponsiveContainer width="100%" height="90%">
                <AreaChart data={chartData}>
                    <defs><linearGradient id="colorCo2" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10B981" stopOpacity={0.1}/><stop offset="95%" stopColor="#10B981" stopOpacity={0}/></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#9ca3af'}} />
                    <Tooltip contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}} />
                    <Area type="monotone" dataKey="co2" stroke="#10B981" strokeWidth={3} fill="url(#colorCo2)" />
                </AreaChart>
             </ResponsiveContainer>
          </div>
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 h-80 flex flex-col">
             <h3 className="font-bold text-gray-800 mb-4 sticky top-0 bg-white">Recent Activity</h3>
             <div className="flex-1 overflow-y-auto pr-2 space-y-3 scrollbar-thin">
                {data.length === 0 && <p className="text-center text-gray-400 text-sm mt-10">No records yet.</p>}
                {data.map(item => (
                    <div key={item.id} className="flex justify-between items-center p-3 hover:bg-gray-50 rounded-xl group transition-colors border border-transparent hover:border-gray-100">
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${item.category === 'transport' || item.category === 'bike' ? 'bg-blue-50 text-blue-600' : item.category === 'flights' ? 'bg-purple-50 text-purple-600' : 'bg-amber-50 text-amber-600'}`}>
                                {item.category === 'transport' ? <Car size={16}/> : item.category === 'bike' ? <Bike size={16}/> : item.category === 'flights' ? <Plane size={16}/> : <Zap size={16}/>}
                            </div>
                            <div><p className="text-sm font-bold capitalize text-gray-700">{item.category}</p><p className="text-[10px] text-gray-400 truncate w-24">{item.details}</p></div>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="font-bold text-gray-900 text-sm">{item.co2.toFixed(0)} kg</span>
                            <button onClick={async () => { if(db) await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'footprint', item.id)); }} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={14}/></button>
                        </div>
                    </div>
                ))}
             </div>
          </div>
      </div>
    </div>
  );
};

const EcoAssistantPage = ({ setNotification }) => {
    const [messages, setMessages] = useState([{ role: 'assistant', text: "Hello! I'm your AI Eco-Assistant. How can I help you reduce your footprint today?" }]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const endRef = useRef(null);

    const handleSend = async (e) => {
        e.preventDefault();
        if (!input.trim()) return;
        const userMsg = { role: 'user', text: input };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsTyping(true);
        try {
            const prompt = `User: ${input}\nAssistant (Helpful Eco Expert):`;
            const text = await GeminiService.generateContent(prompt);
            setMessages(prev => [...prev, { role: 'assistant', text }]);
        } catch (e) {
            setMessages(prev => [...prev, { role: 'assistant', text: "I can't reach the servers right now." }]);
        } finally { setIsTyping(false); }
    };

    useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [messages]);

    return (
        <div className="max-w-3xl mx-auto h-[calc(100vh-140px)] flex flex-col py-6 px-4">
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 flex-1 overflow-hidden flex flex-col">
                <div className="p-4 bg-emerald-50/50 border-b border-gray-100 flex items-center gap-3">
                    <div className="bg-white p-2 rounded-full shadow-sm"><Bot className="text-emerald-600" size={20} /></div>
                    <div>
                        <h3 className="font-bold text-gray-800">Eco Assistant</h3>
                        <div className="flex items-center gap-1 text-xs text-emerald-600"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"/> Online</div>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {messages.map((m, i) => (
                        <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[80%] p-4 rounded-2xl text-sm leading-relaxed shadow-sm ${m.role === 'user' ? 'bg-gray-900 text-white rounded-br-none' : 'bg-gray-100 text-gray-800 rounded-bl-none'}`}>
                                <ReactMarkdown>{m.text}</ReactMarkdown>
                            </div>
                        </div>
                    ))}
                    {isTyping && <div className="text-xs text-gray-400 ml-4 flex gap-1 items-center"><Loader2 className="animate-spin h-3 w-3"/> AI is thinking...</div>}
                    <div ref={endRef} />
                </div>
                <form onSubmit={handleSend} className="p-4 border-t border-gray-100 flex gap-2 bg-gray-50/50">
                    <input value={input} onChange={e => setInput(e.target.value)} className="flex-1 p-4 rounded-xl border-none shadow-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white" placeholder="Ask a question..." />
                    <button className="p-4 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-colors shadow-lg"><Send size={20} /></button>
                </form>
            </div>
        </div>
    );
};

const SettingsPage = () => {
    const [cKey, setCKey] = useState(localStorage.getItem('user_carbon_key') || '');
    const [gKey, setGKey] = useState(localStorage.getItem('user_gemini_key') || '');

    const save = () => {
        localStorage.setItem('user_carbon_key', cKey);
        localStorage.setItem('user_gemini_key', gKey);
        alert("Settings Saved!");
    };

    return (
        <div className="max-w-xl mx-auto py-12 px-4 space-y-6">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
                <p className="text-gray-500 text-sm">Manage your API keys to use your own quota.</p>
            </div>
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 space-y-6">
                <div>
                    <label className="block text-sm font-bold mb-2 text-gray-700">Carbon Interface API Key</label>
                    <div className="relative">
                        <input type="password" value={cKey} onChange={e => setCKey(e.target.value)} className="w-full p-4 bg-gray-50 rounded-xl border-none outline-none focus:ring-2 focus:ring-emerald-500" placeholder="Default (System Key)" />
                        {!cKey && <span className="absolute right-4 top-4 text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">Using Default</span>}
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-bold mb-2 text-gray-700">Google Gemini API Key</label>
                    <div className="relative">
                        <input type="password" value={gKey} onChange={e => setGKey(e.target.value)} className="w-full p-4 bg-gray-50 rounded-xl border-none outline-none focus:ring-2 focus:ring-emerald-500" placeholder="Default (System Key)" />
                        {!gKey && <span className="absolute right-4 top-4 text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">Using Default</span>}
                    </div>
                </div>
                <button onClick={save} className="w-full bg-gray-900 text-white py-4 rounded-xl font-bold hover:bg-gray-800 transition-all shadow-lg flex justify-center items-center gap-2">
                    <Save size={18}/> Save Configuration
                </button>
            </div>
        </div>
    );
};

const AboutPage = () => (
    <div className="max-w-4xl mx-auto py-12 px-4">
        <div className="relative h-64 rounded-3xl overflow-hidden mb-10 shadow-xl">
            <img src={IMAGES.hero} className="absolute inset-0 w-full h-full object-cover" alt="Nature" />
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <h1 className="text-4xl font-bold text-white">About EcoTrack</h1>
            </div>
        </div>
        <div className="prose prose-lg prose-emerald mx-auto">
            <p className="lead text-xl text-gray-600 mb-6">
                EcoTrack is an advanced environmental impact assessment tool designed to bridge the gap between daily activities and their global consequences.
            </p>
            <div className="grid md:grid-cols-2 gap-8 my-12">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h3 className="font-bold text-lg mb-2 flex items-center gap-2"><Globe className="text-emerald-600"/> Our Mission</h3>
                    <p className="text-gray-600 text-sm">To empower individuals with data-driven insights, fostering a global community committed to carbon neutrality.</p>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h3 className="font-bold text-lg mb-2 flex items-center gap-2"><Sparkles className="text-purple-600"/> Technology</h3>
                    <p className="text-gray-600 text-sm">Utilizing Google Gemini AI for personalized reduction strategies and Carbon Interface API for scientific accuracy.</p>
                </div>
            </div>
        </div>
    </div>
);

// --- 4. ENTRY POINT ---

export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('landing');
  const [notification, setNotification] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
        setUser(currentUser);
        if(currentUser && view === 'auth') setView('dashboard');
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
      if (notification) {
          const timer = setTimeout(() => setNotification(null), 3000);
          return () => clearTimeout(timer);
      }
  }, [notification]);

  const handleLogout = async () => {
      await signOut(auth);
      setUser(null);
      setView('landing');
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-gray-900 font-sans selection:bg-emerald-200">
      <Navbar user={user} setView={setView} currentView={view} handleLogout={handleLogout} />
      <AnimatePresence mode="wait">
        {notification && <Notification message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}
        <motion.main key={view} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}>
            {view === 'landing' && (
                <div className="max-w-7xl mx-auto px-4 py-20">
                    <div className="text-center max-w-4xl mx-auto mb-20">
                        <motion.div initial={{scale: 0.9}} animate={{scale: 1}} className="mb-6 inline-flex p-4 bg-emerald-50 rounded-[2rem] text-emerald-600 shadow-sm border border-emerald-100">
                            <Globe size={48} strokeWidth={1.5} />
                        </motion.div>
                        <h1 className="text-6xl md:text-8xl font-bold tracking-tight mb-8 text-slate-900">
                            Future of <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-teal-500">Sustainability</span>
                        </h1>
                        <p className="text-xl text-slate-500 max-w-2xl mx-auto mb-10 leading-relaxed">
                            Precision tracking for the modern world. Calculate emissions from your flights, vehicles, and energy usage with AI-powered insights.
                        </p>
                        <div className="flex flex-col sm:flex-row justify-center gap-4">
                            <button onClick={() => setView(user ? 'dashboard' : 'auth')} className="bg-slate-900 text-white px-10 py-5 rounded-full font-bold text-lg hover:bg-slate-800 transition-all shadow-xl hover:shadow-2xl hover:-translate-y-1 flex items-center justify-center gap-2">
                                {user ? 'Go to Dashboard' : 'Start Tracking Now'} <ArrowRight size={20} />
                            </button>
                            <button onClick={() => setView('calculate')} className="bg-white text-slate-600 border border-slate-200 px-10 py-5 rounded-full font-bold text-lg hover:bg-slate-50 transition-all">
                                Try Calculator
                            </button>
                        </div>
                    </div>
                    
                    <div className="grid md:grid-cols-3 gap-8">
                        {[
                            {icon: Car, title: "Vehicle Analysis", desc: "Real-time data for 5000+ car models & motorbikes."},
                            {icon: Plane, title: "Flight Tracking", desc: "IATA-based airport distance calculation."},
                            {icon: Sparkles, title: "AI Consultant", desc: "Gemini AI provides personalized reduction tips."}
                        ].map((feat, i) => (
                            <div key={i} className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-all text-left group">
                                <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center mb-6 text-slate-900 group-hover:bg-emerald-50 group-hover:text-emerald-600 transition-colors">
                                    <feat.icon size={28} />
                                </div>
                                <h3 className="font-bold text-xl mb-3 text-slate-800">{feat.title}</h3>
                                <p className="text-slate-500 leading-relaxed">{feat.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            
            {view === 'auth' && <AuthPage setUser={setUser} setView={setView} />}
            {view === 'dashboard' && <DashboardPage user={user} setNotification={setNotification} />}
            {view === 'calculate' && <CalculatorPage user={user} setNotification={setNotification} setView={setView} />}
            {view === 'eco-assistant' && <EcoAssistantPage setNotification={setNotification} />}
            {view === 'settings' && <SettingsPage />}
            {view === 'about' && <AboutPage />}
        </motion.main>
      </AnimatePresence>
    </div>
  );
}