/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, Component, ReactNode, ErrorInfo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Plane, 
  Hotel, 
  Car, 
  Search, 
  Menu, 
  X, 
  ArrowRight, 
  MapPin, 
  Calendar, 
  Users,
  ChevronRight,
  Globe,
  Shield,
  Clock,
  LogOut,
  User
} from "lucide-react";
import { cn } from "@/src/lib/utils";
import { auth, db, googleProvider } from "./firebase";
import { signInWithPopup, signOut, onAuthStateChanged, User as FirebaseUser } from "firebase/auth";
import { 
  doc, 
  getDocFromServer, 
  collection, 
  addDoc, 
  query, 
  where, 
  onSnapshot, 
  serverTimestamp,
  Timestamp
} from "firebase/firestore";

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

class ErrorBoundary extends (Component as any) {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "Something went wrong.";
      try {
        const parsedError = JSON.parse(this.state.error?.message || "{}");
        if (parsedError.error) {
          errorMessage = `Firestore Error: ${parsedError.error} during ${parsedError.operationType} on ${parsedError.path}`;
        }
      } catch (e) {
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-bg p-6 text-center">
          <div className="max-w-md w-full p-8 bg-white/5 border border-border rounded-3xl backdrop-blur-xl">
            <h2 className="text-2xl font-serif italic mb-4 text-accent">Oops!</h2>
            <p className="text-muted mb-6">{errorMessage}</p>
            <button 
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-accent rounded-full text-sm font-medium hover:bg-accent/90 transition-colors"
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const NavItem = ({ label, active = false, onClick }: { label: string; active?: boolean; onClick?: () => void }) => (
  <button 
    onClick={onClick}
    className={cn(
      "text-sm font-medium transition-colors hover:text-accent",
      active ? "text-accent" : "text-muted"
    )}
  >
    {label}
  </button>
);

const FeatureCard = ({ icon: Icon, title, description }: { icon: any; title: string; description: string }) => (
  <div className="p-8 border border-border rounded-2xl bg-white/5 backdrop-blur-sm hover:bg-white/10 transition-colors group">
    <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
      <Icon className="w-6 h-6 text-accent" />
    </div>
    <h3 className="text-xl font-serif mb-3 italic">{title}</h3>
    <p className="text-muted text-sm leading-relaxed">{description}</p>
  </div>
);

const DestinationCard = ({ image, city, country, price }: { image: string; city: string; country: string; price: string }) => (
  <motion.div 
    whileHover={{ y: -10 }}
    className="relative aspect-[3/4] rounded-3xl overflow-hidden group cursor-pointer"
  >
    <img 
      src={image} 
      alt={city} 
      className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
      referrerPolicy="no-referrer"
    />
    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
    <div className="absolute bottom-0 left-0 p-8 w-full">
      <p className="text-xs uppercase tracking-widest text-accent mb-1">{country}</p>
      <h3 className="text-2xl font-serif italic mb-4">{city}</h3>
      <div className="flex items-center justify-between">
        <span className="text-sm font-light">From {price}</span>
        <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center group-hover:bg-accent transition-colors">
          <ChevronRight className="w-5 h-5" />
        </div>
      </div>
    </div>
  </motion.div>
);


const SearchBar = ({ 
  className = "", 
  origin, 
  setOrigin, 
  destination, 
  setDestination, 
  travelDate, 
  setTravelDate, 
  passengers, 
  setPassengers,
  showLocationModal,
  setShowLocationModal,
  showDateModal,
  setShowDateModal,
  showPassengerModal,
  setShowPassengerModal,
  handleSearch,
  saLocations
}: { 
  className?: string;
  origin: string;
  setOrigin: (v: string) => void;
  destination: string;
  setDestination: (v: string) => void;
  travelDate: string;
  setTravelDate: (v: string) => void;
  passengers: number;
  setPassengers: (v: number) => void;
  showLocationModal: "origin" | "destination" | null;
  setShowLocationModal: (v: "origin" | "destination" | null) => void;
  showDateModal: boolean;
  setShowDateModal: (v: boolean) => void;
  showPassengerModal: boolean;
  setShowPassengerModal: (v: boolean) => void;
  handleSearch: () => void;
  saLocations: string[];
}) => (
  <div className={cn("w-full max-w-4xl mx-auto bg-white/5 backdrop-blur-2xl border border-border rounded-[2rem] p-2 md:p-4 shadow-2xl relative", className)}>
    <div className="flex flex-col md:flex-row items-stretch gap-2">
      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-2">
        <div 
          onClick={() => setShowLocationModal("origin")}
          className="flex items-center gap-3 md:gap-4 px-4 md:px-6 py-3 md:py-4 bg-white/5 rounded-2xl border border-transparent hover:border-border transition-all cursor-pointer group"
        >
          <MapPin className="w-5 h-5 text-accent" />
          <div className="text-left">
            <p className="text-[10px] uppercase tracking-widest text-muted font-bold">From</p>
            <p className="text-sm font-medium truncate max-w-[120px]">{origin}</p>
          </div>
        </div>
        <div 
          onClick={() => setShowLocationModal("destination")}
          className="flex items-center gap-3 md:gap-4 px-4 md:px-6 py-3 md:py-4 bg-white/5 rounded-2xl border border-transparent hover:border-border transition-all cursor-pointer group"
        >
          <MapPin className="w-5 h-5 text-accent" />
          <div className="text-left">
            <p className="text-[10px] uppercase tracking-widest text-muted font-bold">To</p>
            <p className="text-sm font-medium truncate max-w-[120px]">{destination}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div 
            onClick={() => setShowDateModal(true)}
            className="flex items-center gap-2 md:gap-3 px-3 md:px-4 py-3 md:py-4 bg-white/5 rounded-2xl border border-transparent hover:border-border transition-all cursor-pointer group"
          >
            <Calendar className="w-4 h-4 text-accent" />
            <div className="text-left">
              <p className="text-[10px] uppercase tracking-widest text-muted font-bold">When</p>
              <p className="text-xs font-medium">{travelDate}</p>
            </div>
          </div>
          <div 
            onClick={() => setShowPassengerModal(true)}
            className="flex items-center gap-2 md:gap-3 px-3 md:px-4 py-3 md:py-4 bg-white/5 rounded-2xl border border-transparent hover:border-border transition-all cursor-pointer group"
          >
            <Users className="w-4 h-4 text-accent" />
            <div className="text-left">
              <p className="text-[10px] uppercase tracking-widest text-muted font-bold">Who</p>
              <p className="text-xs font-medium">{passengers} Pax</p>
            </div>
          </div>
        </div>
      </div>
      <button 
        onClick={handleSearch}
        className="bg-accent hover:bg-accent/90 text-white px-8 py-4 md:py-0 rounded-2xl flex items-center justify-center gap-3 transition-all font-medium"
      >
        <Search className="w-5 h-5" />
        <span>Search</span>
      </button>
    </div>

    {/* Modals */}
    <AnimatePresence>
      {showLocationModal && (
        <motion.div 
          key="location-modal"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="absolute bottom-full left-0 mb-4 w-full md:w-72 bg-bg border border-border rounded-3xl p-4 shadow-2xl z-50"
        >
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-serif italic">Select {showLocationModal}</h4>
            <button onClick={() => setShowLocationModal(null)}><X className="w-4 h-4" /></button>
          </div>
          <div className="space-y-1 max-h-60 overflow-y-auto custom-scrollbar">
            {saLocations.map((loc, idx) => (
              <button 
                key={`loc-${loc}-${idx}`}
                onClick={() => {
                  if (showLocationModal === "origin") setOrigin(loc);
                  else setDestination(loc);
                  setShowLocationModal(null);
                }}
                className="w-full text-left px-4 py-2 text-sm rounded-xl hover:bg-white/5 transition-colors"
              >
                {loc}
              </button>
            ))}
          </div>
        </motion.div>
      )}

      {showDateModal && (
        <motion.div 
          key="date-modal"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 w-full md:w-80 bg-bg border border-border rounded-3xl p-6 shadow-2xl z-50"
        >
          <div className="flex items-center justify-between mb-6">
            <h4 className="text-sm font-serif italic">Select Date</h4>
            <button onClick={() => setShowDateModal(false)}><X className="w-4 h-4" /></button>
          </div>
          
          <div className="grid grid-cols-2 gap-2 mb-6">
            {[
              { label: "Today", date: new Date() },
              { label: "Tomorrow", date: new Date(Date.now() + 86400000) },
              { label: "Next Week", date: new Date(Date.now() + 7 * 86400000) },
              { label: "In 1 Month", date: new Date(Date.now() + 30 * 86400000) },
            ].map((opt) => (
              <button
                key={`date-opt-${opt.label}`}
                onClick={() => {
                  setTravelDate(opt.date.toISOString().split('T')[0]);
                  setShowDateModal(false);
                }}
                className="py-2 px-3 bg-white/5 hover:bg-accent/20 border border-border rounded-xl text-[10px] uppercase tracking-widest font-bold transition-all"
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-muted font-bold block">Or pick a specific date</label>
            <input 
              type="date" 
              value={travelDate}
              onChange={(e) => {
                setTravelDate(e.target.value);
                setShowDateModal(false);
              }}
              className="w-full bg-white/5 border border-border rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-accent"
            />
          </div>
        </motion.div>
      )}

      {showPassengerModal && (
        <motion.div 
          key="passenger-modal"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="absolute bottom-full right-0 mb-4 w-full md:w-64 bg-bg border border-border rounded-3xl p-6 shadow-2xl z-50"
        >
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-serif italic">Passengers</h4>
            <button onClick={() => setShowPassengerModal(false)}><X className="w-4 h-4" /></button>
          </div>
          <div className="flex items-center justify-between">
            <button 
              onClick={() => setPassengers(Math.max(1, passengers - 1))}
              className="w-10 h-10 rounded-full border border-border flex items-center justify-center hover:bg-white/5"
            >-</button>
            <span className="text-xl font-medium">{passengers}</span>
            <button 
              onClick={() => setPassengers(Math.min(9, passengers + 1))}
              className="w-10 h-10 rounded-full border border-border flex items-center justify-center hover:bg-white/5"
            >+</button>
          </div>
          <button 
            onClick={() => setShowPassengerModal(false)}
            className="w-full mt-6 py-2 bg-accent rounded-xl text-xs font-bold"
          >Done</button>
        </motion.div>
      )}
    </AnimatePresence>
  </div>
);

export default function App() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("flights");
  const [view, setView] = useState<"landing" | "results" | "destinations" | "hotels" | "cars" | "bookings">("landing");
  const [user, setUser] = useState<FirebaseUser | null>(null);
  
  // Search States
  const [origin, setOrigin] = useState("Johannesburg (JNB)");
  const [destination, setDestination] = useState("Cape Town (CPT)");
  const [travelDate, setTravelDate] = useState(new Date().toISOString().split('T')[0]);
  const [passengers, setPassengers] = useState(1);
  
  // Modal States
  const [showLocationModal, setShowLocationModal] = useState<"origin" | "destination" | null>(null);
  const [showDateModal, setShowDateModal] = useState(false);
  const [showPassengerModal, setShowPassengerModal] = useState(false);

  const SearchBarWrapper = ({ className = "" }: { className?: string }) => (
    <SearchBar 
      className={className}
      origin={origin}
      setOrigin={setOrigin}
      destination={destination}
      setDestination={setDestination}
      travelDate={travelDate}
      setTravelDate={setTravelDate}
      passengers={passengers}
      setPassengers={setPassengers}
      showLocationModal={showLocationModal}
      setShowLocationModal={setShowLocationModal}
      showDateModal={showDateModal}
      setShowDateModal={setShowDateModal}
      showPassengerModal={showPassengerModal}
      setShowPassengerModal={setShowPassengerModal}
      handleSearch={handleSearch}
      saLocations={saLocations}
    />
  );

  const [bookingStatus, setBookingStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  // Filter States
  const [maxPrice, setMaxPrice] = useState(25000);
  const [maxDuration, setMaxDuration] = useState(24);
  const [maxStops, setMaxStops] = useState(2);

  const [myBookings, setMyBookings] = useState<any[]>([]);

  const saLocations = [
    "Johannesburg (JNB)",
    "Cape Town (CPT)",
    "Durban (DUR)",
    "Port Elizabeth (PLZ)",
    "George (GRJ)",
    "East London (ELS)",
    "Bloemfontein (BFN)",
    "Kruger Park (MQP)"
  ];

  const saDestinations = [
    { id: 1, name: "Cape Town", image: "https://images.unsplash.com/photo-1580060839134-75a5edca2e99?auto=format&fit=crop&q=80&w=1000", description: "The Mother City, famous for Table Mountain and beautiful beaches." },
    { id: 2, name: "Kruger National Park", image: "https://images.unsplash.com/photo-1547471080-7cc2caa01a7e?auto=format&fit=crop&q=80&w=1000", description: "One of Africa's largest game reserves, home to the Big Five." },
    { id: 3, name: "Durban", image: "https://images.unsplash.com/photo-1576485375217-d6a95e34d043?auto=format&fit=crop&q=80&w=1000", description: "A coastal city known for its African, Indian and colonial influences." },
    { id: 4, name: "Johannesburg", image: "https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?auto=format&fit=crop&q=80&w=1000", description: "The City of Gold, South Africa's largest city and economic hub." },
    { id: 5, name: "Garden Route", image: "https://images.unsplash.com/photo-1568240905146-563606900224?auto=format&fit=crop&q=80&w=1000", description: "A scenic stretch of the south-eastern coast of South Africa." },
    { id: 6, name: "Drakensberg", image: "https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?auto=format&fit=crop&q=80&w=1000", description: "The highest mountain range in Southern Africa." },
  ];

  const saHotels = [
    { id: 1, name: "The Silo Hotel", location: "Cape Town", price: "R12,500", image: "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&q=80&w=1000" },
    { id: 2, name: "Singita Boulders Lodge", location: "Sabi Sand", price: "R25,000", image: "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&q=80&w=1000" },
    { id: 3, name: "The Oyster Box", location: "Umhlanga", price: "R8,500", image: "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&q=80&w=1000" },
  ];

  const saCars = [
    { id: 1, name: "Range Rover Sport", type: "Luxury SUV", price: "R2,500", image: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&q=80&w=1000" },
    { id: 2, name: "Mercedes-Benz S-Class", type: "Executive Sedan", price: "R3,200", image: "https://images.unsplash.com/photo-1583121274602-3e2820c69888?auto=format&fit=crop&q=80&w=1000" },
    { id: 3, name: "BMW M4", type: "Performance Coupe", price: "R2,800", image: "https://images.unsplash.com/photo-1555215695-3004980ad54e?auto=format&fit=crop&q=80&w=1000" },
  ];

  const mockFlights = [
    { id: "1", airline: "South African Airways", departure: "10:00 AM", arrival: "12:00 PM", duration: 2, stops: 0, price: 1450, logo: "https://upload.wikimedia.org/wikipedia/en/thumb/3/3a/South_African_Airways_Logo.svg/1200px-South_African_Airways_Logo.svg.png" },
    { id: "2", airline: "Airlink", departure: "12:30 PM", arrival: "2:30 PM", duration: 2, stops: 0, price: 1220, logo: "https://upload.wikimedia.org/wikipedia/en/thumb/7/7a/Airlink_Logo.svg/1200px-Airlink_Logo.svg.png" },
    { id: "3", airline: "FlySafair", departure: "08:00 AM", arrival: "10:00 AM", duration: 2, stops: 0, price: 890, logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/FlySafair_logo.svg/1200px-FlySafair_logo.svg.png" },
    { id: "4", airline: "CemAir", departure: "03:00 PM", arrival: "05:00 PM", duration: 2, stops: 0, price: 1550, logo: "https://upload.wikimedia.org/wikipedia/en/thumb/4/4c/CemAir_logo.png/220px-CemAir_logo.png" },
    { id: "5", airline: "Lift", departure: "11:00 AM", arrival: "01:00 PM", duration: 2, stops: 0, price: 1280, logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/LIFT_Airline_Logo.png/1200px-LIFT_Airline_Logo.png" },
    { id: "6", airline: "British Airways (Comair)", departure: "06:00 AM", arrival: "08:00 AM", duration: 2, stops: 0, price: 1410, logo: "https://upload.wikimedia.org/wikipedia/en/thumb/0/00/British_Airways_Logo.svg/1200px-British_Airways_Logo.svg.png" },
  ];

  const filteredFlights = mockFlights.filter(f => 
    f.price <= maxPrice && 
    f.duration <= maxDuration && 
    f.stops <= maxStops
  );

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll);
    
    let unsubscribeBookings: (() => void) | undefined;

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const q = query(collection(db, "bookings"), where("userId", "==", currentUser.uid));
        unsubscribeBookings = onSnapshot(q, (snapshot) => {
          const bookings = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setMyBookings(bookings);
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, "bookings");
        });
      } else {
        setMyBookings([]);
        if (unsubscribeBookings) unsubscribeBookings();
      }
    });

    // Test Firestore connection
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    };
    testConnection();

    return () => {
      window.removeEventListener("scroll", handleScroll);
      unsubscribe();
    };
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const handleSearch = () => {
    if (origin === destination) {
      alert("Origin and destination cannot be the same.");
      return;
    }
    setView("results");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleBookFlight = async (flight: any) => {
    if (!user) {
      handleLogin();
      return;
    }

    try {
      const bookingData = {
        userId: user.uid,
        flightId: flight.id,
        airline: flight.airline,
        logo: flight.logo,
        origin: origin,
        destination: destination,
        departureTime: flight.departure,
        arrivalTime: flight.arrival,
        price: flight.price,
        passengers: passengers,
        travelDate: travelDate,
        status: "confirmed",
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, "bookings"), bookingData);
      setBookingStatus({ type: 'success', message: `Successfully booked flight with ${flight.airline}!` });
      setTimeout(() => setBookingStatus(null), 5000);
      setView("bookings");
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, "bookings");
    }
  };

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-bg text-ink selection:bg-accent selection:text-white">
      {/* Navigation */}
      <nav className={cn(
        "fixed top-0 left-0 w-full z-50 transition-all duration-500 py-6 px-6 md:px-12 flex items-center justify-between",
        isScrolled || view === "results" ? "bg-bg/80 backdrop-blur-xl py-4 border-b border-border" : "bg-transparent"
      )}>
        <div className="flex items-center gap-12">
          <button onClick={() => setView("landing")} className="text-2xl font-serif italic tracking-tighter flex items-center gap-2">
            <div className="w-8 h-8 bg-accent rounded-full flex items-center justify-center">
              <Plane className="w-4 h-4 text-white -rotate-45" />
            </div>
            Revel
          </button>
          <div className="hidden md:flex items-center gap-8">
            <NavItem label="Flights" active={view === "landing" || view === "results"} onClick={() => setView("landing")} />
            <NavItem label="Hotels" active={view === "hotels"} onClick={() => setView("hotels")} />
            <NavItem label="Car Rentals" active={view === "cars"} onClick={() => setView("cars")} />
            <NavItem label="Destinations" active={view === "destinations"} onClick={() => setView("destinations")} />
            {user && <NavItem label="My Bookings" active={view === "bookings"} onClick={() => setView("bookings")} />}
          </div>
        </div>
        
        <div className="hidden md:flex items-center gap-6">
          {user ? (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                {user.photoURL ? (
                  <img src={user.photoURL} alt={user.displayName || ""} className="w-8 h-8 rounded-full border border-border" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center">
                    <User className="w-4 h-4 text-accent" />
                  </div>
                )}
                <span className="text-sm font-medium">{user.displayName?.split(' ')[0]}</span>
              </div>
              <button 
                onClick={handleLogout}
                className="p-2 hover:text-accent transition-colors"
                title="Log Out"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <>
              <button 
                onClick={handleLogin}
                className="text-sm font-medium text-muted hover:text-accent transition-colors"
              >
                Log In
              </button>
              <button 
                onClick={handleLogin}
                className="px-6 py-2.5 bg-accent rounded-full text-sm font-medium hover:bg-accent/90 transition-colors"
              >
                Sign Up
              </button>
            </>
          )}
        </div>

        <button 
          className="md:hidden text-ink"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X /> : <Menu />}
        </button>
      </nav>

      <AnimatePresence mode="wait">
        {view === "landing" ? (
          <motion.div
            key="landing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* Hero Section */}
            <section className="relative min-h-screen flex flex-col items-center justify-center pt-20 px-6 overflow-hidden">
              {/* Background Elements */}
              <div className="absolute top-1/4 -left-20 w-96 h-96 bg-accent/10 rounded-full blur-[120px]" />
              <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-accent/5 rounded-full blur-[120px]" />
              
              <div className="max-w-5xl w-full text-center relative z-10">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8 }}
                >
                  <span className="text-xs uppercase tracking-[0.3em] text-accent font-semibold mb-6 block">
                    Explore South Africa
                  </span>
                  <h1 className="text-6xl md:text-8xl lg:text-9xl font-serif italic leading-[0.9] mb-12">
                    Travel with <br />
                    <span className="text-accent">Elegance</span>
                  </h1>
                </motion.div>

                {/* Search Bar Widget */}
                <SearchBarWrapper />
              </div>

              {/* Scroll Indicator */}
              <motion.div 
                animate={{ y: [0, 10, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
              >
                <div className="w-px h-12 bg-gradient-to-b from-accent to-transparent" />
                <span className="text-[10px] uppercase tracking-widest text-muted">Scroll</span>
              </motion.div>
            </section>

            {/* Featured Destinations */}
            <section className="py-32 px-6 md:px-12 max-w-7xl mx-auto">
              <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 gap-8">
                <div className="max-w-2xl">
                  <span className="text-xs uppercase tracking-widest text-accent font-bold mb-4 block">Local Gems</span>
                  <h2 className="text-4xl md:text-6xl font-serif italic leading-tight">
                    Destinations that <br /> inspire wanderlust
                  </h2>
                </div>
                <button 
                  onClick={() => setView("destinations")}
                  className="group flex items-center gap-3 text-sm font-medium hover:text-accent transition-colors"
                >
                  View all destinations
                  <div className="w-10 h-10 rounded-full border border-border flex items-center justify-center group-hover:border-accent group-hover:bg-accent transition-all">
                    <ArrowRight className="w-4 h-4" />
                  </div>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                <DestinationCard 
                  image="https://images.unsplash.com/photo-1580060839134-75a5edca2e99?auto=format&fit=crop&q=80&w=1000"
                  city="Cape Town"
                  country="South Africa"
                  price="R1,200"
                />
                <DestinationCard 
                  image="https://images.unsplash.com/photo-1547471080-7cc2caa01a7e?auto=format&fit=crop&q=80&w=1000"
                  city="Kruger Park"
                  country="South Africa"
                  price="R3,450"
                />
                <DestinationCard 
                  image="https://images.unsplash.com/photo-1576485375217-d6a95e34d043?auto=format&fit=crop&q=80&w=1000"
                  city="Durban"
                  country="South Africa"
                  price="R1,100"
                />
              </div>
            </section>
          </motion.div>
        ) : view === "results" ? (
          <motion.div
            key="results"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="pt-32 pb-20 px-6 md:px-12 max-w-7xl mx-auto"
          >
            {bookingStatus && (
              <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8 p-4 bg-accent/20 border border-accent rounded-2xl text-accent text-center font-medium"
              >
                {bookingStatus.message}
              </motion.div>
            )}
            <div className="mb-12">
              <SearchBarWrapper className="mb-12" />
            </div>
            <div className="flex flex-col md:flex-row gap-12">
              {/* Sidebar Filters */}
              <aside className="w-full md:w-72 flex-shrink-0">
                <div className="sticky top-32 space-y-10">
                  <div>
                    <h3 className="text-lg font-serif italic mb-6">Filters</h3>
                    <div className="space-y-8">
                      {/* Price Filter */}
                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <label className="text-xs uppercase tracking-widest text-muted font-bold">Max Price</label>
                          <span className="text-accent font-medium">R{maxPrice}</span>
                        </div>
                        <input 
                          type="range" 
                          min="500" 
                          max="25000" 
                          step="500"
                          value={maxPrice}
                          onChange={(e) => setMaxPrice(parseInt(e.target.value))}
                          className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-accent"
                        />
                      </div>

                      {/* Duration Filter */}
                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <label className="text-xs uppercase tracking-widest text-muted font-bold">Max Duration</label>
                          <span className="text-accent font-medium">{maxDuration}h</span>
                        </div>
                        <input 
                          type="range" 
                          min="2" 
                          max="24" 
                          step="1"
                          value={maxDuration}
                          onChange={(e) => setMaxDuration(parseInt(e.target.value))}
                          className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-accent"
                        />
                      </div>

                      {/* Stops Filter */}
                      <div className="space-y-4">
                        <label className="text-xs uppercase tracking-widest text-muted font-bold block">Stops</label>
                        <div className="flex gap-2">
                          {[0, 1, 2].map((stop) => (
                            <button
                              key={stop}
                              onClick={() => setMaxStops(stop)}
                              className={cn(
                                "flex-1 py-2 rounded-xl border text-xs font-medium transition-all",
                                maxStops === stop 
                                  ? "bg-accent border-accent text-white" 
                                  : "bg-white/5 border-border text-muted hover:border-accent/50"
                              )}
                            >
                              {stop === 0 ? "Non-stop" : `${stop} Stop${stop > 1 ? "s" : ""}`}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <button 
                    onClick={() => {
                      setMaxPrice(25000);
                      setMaxDuration(24);
                      setMaxStops(2);
                    }}
                    className="w-full py-3 text-xs uppercase tracking-widest font-bold text-muted hover:text-accent transition-colors"
                  >
                    Reset Filters
                  </button>
                </div>
              </aside>

              {/* Results List */}
              <div className="flex-1 space-y-6">
                <div className="flex items-center justify-between mb-8">
                  <p className="text-sm text-muted">
                    Showing <span className="text-ink font-medium">{filteredFlights.length}</span> flights
                  </p>
                  <div className="flex items-center gap-2 text-xs font-medium text-muted">
                    Sort by: 
                    <select className="bg-transparent text-ink focus:outline-none cursor-pointer">
                      <option>Recommended</option>
                      <option>Price: Low to High</option>
                      <option>Duration: Shortest</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-4">
                  {filteredFlights.length > 0 ? (
                    filteredFlights.map((flight) => (
                      <motion.div 
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        key={flight.id}
                        className="p-6 bg-white/5 border border-border rounded-3xl hover:bg-white/10 transition-all group cursor-pointer"
                      >
                        <div className="flex flex-col md:flex-row items-center gap-8">
                          <div className="flex items-center gap-4 w-full md:w-48">
                            <img src={flight.logo} alt={flight.airline} className="w-10 h-10 rounded-full object-contain bg-white p-1 transition-all" />
                            <div>
                              <p className="text-sm font-medium">{flight.airline}</p>
                              <p className="text-[10px] text-muted uppercase tracking-widest">Economy</p>
                            </div>
                          </div>

                          <div className="flex-1 flex items-center justify-between w-full">
                            <div className="text-center md:text-left">
                              <p className="text-lg font-medium">{flight.departure}</p>
                              <p className="text-xs text-muted">JNB</p>
                            </div>

                            <div className="flex-1 px-8 flex flex-col items-center gap-2">
                              <p className="text-[10px] text-muted uppercase tracking-widest font-bold">{flight.duration}h</p>
                              <div className="relative w-full h-px bg-border">
                                <div className="absolute top-1/2 left-0 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-border" />
                                <div className="absolute top-1/2 right-0 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-border" />
                                {flight.stops > 0 && (
                                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-accent" />
                                )}
                              </div>
                              <p className="text-[10px] text-accent uppercase tracking-widest font-bold">
                                {flight.stops === 0 ? "Non-stop" : `${flight.stops} Stop`}
                              </p>
                            </div>

                            <div className="text-center md:text-right">
                              <p className="text-lg font-medium">{flight.arrival}</p>
                              <p className="text-xs text-muted">CPT</p>
                            </div>
                          </div>

                          <div className="w-full md:w-32 text-center md:text-right">
                            <p className="text-2xl font-serif italic mb-2">R{flight.price}</p>
                            <button 
                              onClick={() => handleBookFlight(flight)}
                              className="w-full py-2 bg-white/10 hover:bg-accent hover:text-white rounded-xl text-xs font-bold transition-all"
                            >
                              Select
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    ))
                  ) : (
                    <div className="py-20 text-center space-y-4">
                      <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto">
                        <Search className="w-8 h-8 text-muted" />
                      </div>
                      <h3 className="text-xl font-serif italic">No flights found</h3>
                      <p className="text-muted text-sm">Try adjusting your filters to find more options.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        ) : view === "bookings" ? (
          <motion.div
            key="bookings"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pt-32 pb-20 px-6 md:px-12 max-w-7xl mx-auto"
          >
            <h2 className="text-4xl font-serif italic mb-12">My Bookings</h2>
            {myBookings.length > 0 ? (
              <div className="grid grid-cols-1 gap-6">
                {myBookings.map((booking) => (
                  <div key={booking.id} className="p-8 bg-white/5 border border-border rounded-[2rem] flex flex-col md:flex-row items-center justify-between gap-8">
                    <div className="flex items-center gap-6">
                      <div className="w-16 h-16 rounded-full bg-white p-2 flex items-center justify-center border border-border">
                        {booking.logo ? (
                          <img src={booking.logo} alt={booking.airline} className="w-full h-full object-contain" />
                        ) : (
                          <Plane className="w-8 h-8 text-accent" />
                        )}
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-widest text-accent font-bold mb-1">{booking.airline}</p>
                        <h3 className="text-xl font-serif italic">{booking.origin} to {booking.destination}</h3>
                        <p className="text-sm text-muted">{booking.travelDate} • {booking.passengers} Passenger(s)</p>
                      </div>
                    </div>
                    <div className="text-center md:text-right">
                      <p className="text-2xl font-serif italic mb-1">R{booking.price}</p>
                      <span className="px-4 py-1.5 bg-accent/20 text-accent rounded-full text-[10px] uppercase tracking-widest font-bold">
                        {booking.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-20 text-center space-y-6">
                <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto">
                  <Plane className="w-10 h-10 text-muted" />
                </div>
                <h3 className="text-2xl font-serif italic">No bookings yet</h3>
                <p className="text-muted max-w-md mx-auto">Your travel history will appear here once you've made your first booking.</p>
                <button 
                  onClick={() => setView("landing")}
                  className="px-8 py-3 bg-accent rounded-full text-sm font-bold"
                >Explore Flights</button>
              </div>
            )}
          </motion.div>
        ) : view === "destinations" ? (
          <motion.div
            key="destinations"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pt-32 pb-20 px-6 md:px-12 max-w-7xl mx-auto"
          >
            <div className="mb-12">
              <span className="text-xs uppercase tracking-widest text-accent font-bold mb-4 block">Explore</span>
              <h2 className="text-5xl font-serif italic">South African Gems</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {saDestinations.map(dest => (
                <div key={dest.id} className="group cursor-pointer">
                  <div className="relative aspect-[4/5] rounded-[2rem] overflow-hidden mb-6">
                    <img src={dest.image} alt={dest.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" referrerPolicy="no-referrer" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60" />
                    <div className="absolute bottom-8 left-8">
                      <h3 className="text-2xl font-serif italic text-white">{dest.name}</h3>
                    </div>
                  </div>
                  <p className="text-muted text-sm leading-relaxed">{dest.description}</p>
                </div>
              ))}
            </div>
          </motion.div>
        ) : view === "hotels" ? (
          <motion.div
            key="hotels"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pt-32 pb-20 px-6 md:px-12 max-w-7xl mx-auto"
          >
            <div className="mb-12">
              <span className="text-xs uppercase tracking-widest text-accent font-bold mb-4 block">Stay</span>
              <h2 className="text-5xl font-serif italic">Luxury Accommodations</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {saHotels.map(hotel => (
                <div key={hotel.id} className="bg-white/5 border border-border rounded-[2.5rem] overflow-hidden group">
                  <div className="aspect-video overflow-hidden">
                    <img src={hotel.image} alt={hotel.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" referrerPolicy="no-referrer" />
                  </div>
                  <div className="p-8">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-xl font-serif italic mb-1">{hotel.name}</h3>
                        <p className="text-xs text-muted uppercase tracking-widest">{hotel.location}</p>
                      </div>
                      <p className="text-accent font-medium">{hotel.price}<span className="text-[10px] text-muted">/night</span></p>
                    </div>
                    <button className="w-full py-3 bg-white/10 hover:bg-accent hover:text-white rounded-xl text-xs font-bold transition-all">
                      Book Stay
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        ) : view === "cars" ? (
          <motion.div
            key="cars"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pt-32 pb-20 px-6 md:px-12 max-w-7xl mx-auto"
          >
            <div className="mb-12">
              <span className="text-xs uppercase tracking-widest text-accent font-bold mb-4 block">Drive</span>
              <h2 className="text-5xl font-serif italic">Premium Fleet</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {saCars.map(car => (
                <div key={car.id} className="bg-white/5 border border-border rounded-[2.5rem] p-8 group">
                  <div className="aspect-[16/10] mb-8 overflow-hidden rounded-2xl">
                    <img src={car.image} alt={car.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" referrerPolicy="no-referrer" />
                  </div>
                  <div className="flex justify-between items-end mb-8">
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-accent font-bold mb-1">{car.type}</p>
                      <h3 className="text-xl font-serif italic">{car.name}</h3>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-medium">{car.price}</p>
                      <p className="text-[10px] text-muted uppercase tracking-widest">per day</p>
                    </div>
                  </div>
                  <button className="w-full py-3 bg-white/10 hover:bg-accent hover:text-white rounded-xl text-xs font-bold transition-all">
                    Rent Now
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key={view}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pt-32 pb-20 px-6 md:px-12 max-w-7xl mx-auto min-h-[60vh] flex flex-col items-center justify-center text-center"
          >
            <h2 className="text-5xl font-serif italic mb-6 capitalize">{view}</h2>
            <p className="text-muted mb-12 max-w-lg">
              Our {view} selection is currently being curated to ensure only the most exquisite options are available for our members.
            </p>
            <button 
              onClick={() => setView("landing")}
              className="px-8 py-3 bg-white/5 border border-border rounded-full text-sm font-bold hover:bg-accent hover:border-accent transition-all"
            >Back to Home</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Features Section (Only on Landing) */}
      {view === "landing" && (
        <>
          <section className="py-32 bg-white/5 border-y border-border">
            <div className="max-w-7xl mx-auto px-6 md:px-12">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-16 items-center">
                <div className="lg:col-span-1">
                  <span className="text-xs uppercase tracking-widest text-accent font-bold mb-4 block">Why Revel</span>
                  <h2 className="text-4xl md:text-5xl font-serif italic leading-tight mb-8">
                    The art of seamless travel planning
                  </h2>
                  <p className="text-muted mb-10 leading-relaxed">
                    We believe that the journey should be as exquisite as the destination. Our platform combines cutting-edge technology with human intuition.
                  </p>
                  <div className="flex flex-col gap-6">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
                        <Globe className="w-5 h-5 text-accent" />
                      </div>
                      <span className="font-medium">Global Network</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
                        <Shield className="w-5 h-5 text-accent" />
                      </div>
                      <span className="font-medium">Premium Security</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
                        <Clock className="w-5 h-5 text-accent" />
                      </div>
                      <span className="font-medium">24/7 Concierge</span>
                    </div>
                  </div>
                </div>
                
                <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FeatureCard 
                    icon={Search}
                    title="Smart Comparison"
                    description="Our proprietary algorithm scans thousands of sources to find the absolute best value for your specific needs."
                  />
                  <FeatureCard 
                    icon={Plane}
                    title="Exclusive Routes"
                    description="Access private charters and first-class inventory not available on standard booking platforms."
                  />
                  <FeatureCard 
                    icon={Hotel}
                    title="Luxury Stays"
                    description="Hand-picked collection of the world's most prestigious hotels and hidden boutique gems."
                  />
                  <FeatureCard 
                    icon={Car}
                    title="Elite Transport"
                    description="From chauffeured limousines to exotic car rentals, we handle every mile of your journey."
                  />
                </div>
              </div>
            </div>
          </section>

          {/* CTA Section */}
          <section className="py-32 px-6">
            <div className="max-w-5xl mx-auto relative rounded-[3rem] overflow-hidden bg-accent p-12 md:p-24 text-center">
              <div className="absolute top-0 left-0 w-full h-full opacity-20 pointer-events-none">
                <img 
                  src="https://images.unsplash.com/photo-1436491865332-7a61a109c0f2?auto=format&fit=crop&q=80&w=2000" 
                  alt="Airplane" 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="relative z-10">
                <h2 className="text-4xl md:text-7xl font-serif italic mb-8">Ready for your next <br /> masterpiece?</h2>
                <p className="text-white/80 text-lg mb-12 max-w-xl mx-auto">
                  Join over 2 million sophisticated travelers who trust Revel for their global adventures.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <button className="w-full sm:w-auto px-10 py-5 bg-white text-bg rounded-full font-bold hover:bg-white/90 transition-all">
                    Download the App
                  </button>
                  <button className="w-full sm:w-auto px-10 py-5 bg-transparent border border-white/30 text-white rounded-full font-bold hover:bg-white/10 transition-all">
                    Learn More
                  </button>
                </div>
              </div>
            </div>
          </section>
        </>
      )}

      {/* Footer */}
      <footer className="py-20 px-6 md:px-12 border-t border-border">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-20">
            <div className="col-span-1 lg:col-span-1">
              <button onClick={() => setView("landing")} className="text-2xl font-serif italic tracking-tighter flex items-center gap-2 mb-6">
                <div className="w-8 h-8 bg-accent rounded-full flex items-center justify-center">
                  <Plane className="w-4 h-4 text-white -rotate-45" />
                </div>
                Revel
              </button>
              <p className="text-muted text-sm leading-relaxed max-w-xs">
                The world's most sophisticated travel search platform. Designed for those who seek the extraordinary.
              </p>
            </div>
            
            <div>
              <h4 className="text-sm font-bold uppercase tracking-widest mb-6">Product</h4>
              <ul className="flex flex-col gap-4 text-sm text-muted">
                <li><button onClick={() => setView("landing")} className="hover:text-accent transition-colors">Flights</button></li>
                <li><button onClick={() => setView("hotels")} className="hover:text-accent transition-colors">Hotels</button></li>
                <li><button onClick={() => setView("cars")} className="hover:text-accent transition-colors">Car Rentals</button></li>
                <li><button onClick={() => setView("destinations")} className="hover:text-accent transition-colors">Destinations</button></li>
              </ul>
            </div>
            
            <div>
              <h4 className="text-sm font-bold uppercase tracking-widest mb-6">Company</h4>
              <ul className="flex flex-col gap-4 text-sm text-muted">
                <li><a href="#" className="hover:text-accent transition-colors">About Us</a></li>
                <li><a href="#" className="hover:text-accent transition-colors">Careers</a></li>
                <li><a href="#" className="hover:text-accent transition-colors">Press</a></li>
                <li><a href="#" className="hover:text-accent transition-colors">Contact</a></li>
              </ul>
            </div>
            
            <div>
              <h4 className="text-sm font-bold uppercase tracking-widest mb-6">Newsletter</h4>
              <p className="text-sm text-muted mb-6">Subscribe for exclusive travel insights and offers.</p>
              <div className="flex gap-2">
                <input 
                  type="email" 
                  placeholder="Email address" 
                  className="flex-1 bg-white/5 border border-border rounded-full px-6 py-3 text-sm focus:outline-none focus:border-accent transition-colors"
                />
                <button className="w-12 h-12 bg-accent rounded-full flex items-center justify-center hover:bg-accent/90 transition-all">
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
          
          <div className="flex flex-col md:flex-row items-center justify-between pt-12 border-t border-border gap-6">
            <p className="text-xs text-muted">© 2026 Revel Travel Platform. All rights reserved.</p>
            <div className="flex gap-8 text-xs text-muted">
              <a href="#" className="hover:text-accent transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-accent transition-colors">Terms of Service</a>
              <a href="#" className="hover:text-accent transition-colors">Cookie Policy</a>
            </div>
          </div>
        </div>
      </footer>
      </div>
    </ErrorBoundary>
  );
}
