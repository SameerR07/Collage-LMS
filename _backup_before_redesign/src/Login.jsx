import React, { useState } from 'react';
import { Mail, Lock, EyeOff, Eye, GraduationCap, Handshake, Building2, ShieldCheck, ChevronRight } from 'lucide-react';

const Login = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [activeTab, setActiveTab] = useState('sign-in');

  return (
    // Main Container
    <div className="min-h-screen flex items-center justify-center p-4">
      
      {/* Box jisme Card aur Right Stats honge */}
      <div className="max-w-[1250px] w-full flex flex-col xl:flex-row gap-6 h-auto xl:h-[680px]">
        
        {/* L-SHAPE MAIN LOGIN CARD */}
        <div className="flex-1 flex flex-col lg:flex-row bg-[#fbf9f4] rounded-[2rem] shadow-2xl overflow-hidden border border-gray-200/60">
          
          {/* ================= LEFT SIDE (DARK NAVY THEME) ================= */}
          <div className="lg:w-[55%] bg-[#151c2c] p-10 xl:p-12 flex flex-col justify-between relative overflow-hidden text-white shadow-[inset_-10px_0_30px_rgba(0,0,0,0.3)]">
            
            {/* Design wale gole (Background decorations) */}
            <div className="absolute top-0 right-0 w-72 h-72 bg-white/5 rounded-full blur-3xl -mr-20 -mt-20"></div>
            <div className="absolute bottom-0 left-0 w-full h-48 bg-gradient-to-t from-cyan-900/20 to-transparent"></div>

            <div className="relative z-10">
              {/* Top Header - Logo and NAAC */}
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-2">
                  {/* Public folder mein rakhi hui GJIMT logo image */}
                  <img src="/gjimt-brand.png" alt="GJIMT Logo" className="h-10 bg-white p-1 rounded-md" />
                </div>
                <div className="text-[10px] font-bold text-red-500 bg-white/10 px-2.5 py-1 rounded border border-red-500/30">
                  NAAC ACCREDITED
                </div>
              </div>

              {/* Verified Badge */}
              <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 px-3 py-1.5 rounded-full text-[11px] font-medium text-orange-200 mb-10 w-fit">
                <ShieldCheck size={14} className="text-orange-400" /> Verified campus portal
              </div>

              {/* Main Heading */}
              <h1 className="text-4xl xl:text-5xl font-extrabold tracking-tight leading-tight mb-10">
                <span className="text-gray-200 drop-shadow-md">LEARN. PREPARE.</span><br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-orange-600 drop-shadow-lg">GET PLACED.</span>
              </h1>

              {/* 3 Feature Boxes */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center hover:bg-white/10 transition duration-300">
                  <div className="bg-white/10 w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <GraduationCap className="text-gray-300" size={24} />
                  </div>
                  <h3 className="font-bold text-[11px] text-white mb-1 uppercase tracking-wide">Career Readiness</h3>
                  <p className="text-[10px] text-gray-400 leading-tight">Curated skills and certifications</p>
                </div>
                
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center hover:bg-white/10 transition duration-300">
                  <div className="bg-white/10 w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <Handshake className="text-[#d89f74]" size={24} />
                  </div>
                  <h3 className="font-bold text-[11px] text-white mb-1 uppercase tracking-wide">Opportunity Hub</h3>
                  <p className="text-[10px] text-gray-400 leading-tight">Exclusive internships & jobs</p>
                </div>
                
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center hover:bg-white/10 transition duration-300">
                  <div className="bg-white/10 w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <Building2 className="text-gray-300" size={24} />
                  </div>
                  <h3 className="font-bold text-[11px] text-white mb-1 uppercase tracking-wide">Industry Connections</h3>
                  <p className="text-[10px] text-gray-400 leading-tight">Recruiter networks & mentoring</p>
                </div>
              </div>
            </div>

            {/* Bottom Footer Line Left Side */}
            <div className="relative z-10 text-[10px] text-gray-500 uppercase tracking-widest font-semibold mt-4">
              Gian Jyoti Institute of Management & Technology
            </div>
          </div>

          {/* ================= RIGHT SIDE (CREAM FORM) ================= */}
          <div className="lg:w-[45%] p-8 xl:p-12 flex flex-col justify-center relative">
            
            {/* Header Text */}
            <div className="mb-8 flex items-center gap-3">
              <div className="bg-gray-200/80 p-2.5 rounded-xl text-gray-700 shadow-sm border border-gray-300/50">
                <Lock size={20} />
              </div>
              <div>
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Placement Portal</p>
                <h2 className="text-2xl font-extrabold text-gray-900">Student LMS Access</h2>
                <p className="text-xs text-gray-500 mt-0.5">Sign in to continue to your Placement LMS.</p>
              </div>
            </div>

            {/* Top Tabs (Sign in, Recruiter, Demo) */}
            <div className="bg-gray-200/70 p-1.5 rounded-2xl flex gap-1 mb-8 shadow-inner">
              <button 
                onClick={() => setActiveTab('sign-in')}
                className={`flex-1 py-2 px-2 rounded-xl text-xs font-bold transition-all duration-300 ${activeTab === 'sign-in' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Sign In
              </button>
              <button 
                onClick={() => setActiveTab('recruiter')}
                className={`flex-1 py-2 px-2 rounded-xl text-xs font-bold transition-all duration-300 ${activeTab === 'recruiter' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Recruiter Login
              </button>
              <button 
                onClick={() => setActiveTab('demo')}
                className={`flex-1 py-2 px-2 rounded-xl text-xs font-bold transition-all duration-300 ${activeTab === 'demo' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Demo Access
              </button>
            </div>

            {/* Main Form Fields */}
            <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5 ml-1">Login ID (femo ID)</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Mail size={16} className="text-gray-400" />
                  </div>
                  <input 
                    type="email" 
                    placeholder="username@gjimct.ac.in" 
                    className="w-full pl-11 pr-4 py-3.5 bg-gray-100/80 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 transition-all text-gray-800 placeholder-gray-400 shadow-sm font-medium"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5 ml-1 mr-1">
                  <label className="block text-xs font-bold text-gray-700">Password</label>
                  <a href="#" className="text-[11px] font-bold text-gray-500 hover:text-orange-600 transition-colors">Forgot password?</a>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Lock size={16} className="text-gray-400" />
                  </div>
                  <input 
                    type={showPassword ? "text" : "password"} 
                    placeholder="••••••••" 
                    className="w-full pl-11 pr-11 py-3.5 bg-gray-100/80 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 transition-all text-gray-800 placeholder-gray-400 shadow-sm font-medium"
                  />
                  <button 
                    type="button" 
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <Eye size={18} /> : <EyeOff size={18} />}
                  </button>
                </div>
              </div>

              {/* Checkbox */}
              <div className="flex items-center justify-between mt-2 ml-1">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input type="checkbox" className="w-4 h-4 rounded text-orange-500 focus:ring-orange-500 border-gray-300" defaultChecked />
                  <span className="text-xs text-gray-700 font-semibold group-hover:text-gray-900 transition-colors">Remember me</span>
                </label>
                <span className="text-[11px] text-gray-400 font-medium">Fill demo login</span>
              </div>

              <p className="text-[10px] text-center text-gray-500 mt-2">
                Full access requires valid credentials. New? Explore with <span className="font-bold text-gray-700 cursor-pointer hover:text-orange-600">Demo Access</span>.
              </p>

              {/* Sign In Button */}
              <button className="w-full bg-gradient-to-r from-[#ea580c] to-[#c2410c] hover:from-[#c2410c] hover:to-[#9a3412] text-white font-bold py-4 px-4 rounded-xl shadow-[0_8px_20px_-6px_rgba(234,88,12,0.6)] flex items-center justify-center gap-2 transition-all active:scale-[0.98]">
                Sign In <ChevronRight size={18} />
              </button>

              {/* OR Line */}
              <div className="relative flex items-center justify-center py-1">
                <div className="border-t border-gray-300 w-full absolute"></div>
                <span className="bg-[#fbf9f4] px-4 text-[10px] text-gray-400 relative z-10 font-bold uppercase tracking-wider">or continue with</span>
              </div>

              {/* Google Button */}
              <button type="button" className="w-full bg-white border border-gray-300 text-gray-700 font-bold py-3.5 px-4 rounded-xl flex items-center justify-center gap-3 hover:bg-gray-50 transition-all shadow-sm">
                <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" className="w-5 h-5" />
                Continue with Google
              </button>
            </form>

            {/* Form Bottom Links */}
            <div className="mt-8 text-center">
              <div className="inline-flex items-center justify-center gap-2 text-[10px] font-bold text-gray-700 bg-white py-1.5 px-4 rounded-full mb-4 border border-gray-200 shadow-sm">
                <img src="https://www.svgrepo.com/show/353735/firebase.svg" alt="Firebase" className="w-3.5 h-3.5" /> Verified by Firebase
              </div>
              <div className="flex flex-wrap justify-center items-center gap-x-3 gap-y-1 text-[10.5px] text-gray-600 font-semibold mb-2">
                <a href="#" className="hover:text-orange-600 transition">About Us</a>
                <span>|</span>
                <a href="#" className="hover:text-orange-600 transition">Contact</a>
                <span>|</span>
                <a href="#" className="hover:text-orange-600 transition">Privacy Policy</a>
                <span>|</span>
                <a href="#" className="hover:text-orange-600 transition">Career Center</a>
                <span className="flex items-center gap-1 ml-1 text-gray-500">
                  Follow us: 
                  <span className="bg-gray-200 p-1 rounded-md cursor-pointer hover:bg-gray-300 text-gray-700 ml-1">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg>
                  </span>
                  <span className="bg-gray-200 p-1 rounded-md cursor-pointer hover:bg-gray-300 text-gray-700">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M24 4.557c-.883.392-1.832.656-2.828.775 1.017-.609 1.798-1.574 2.165-2.724-.951.564-2.005.974-3.127 1.195-.897-.957-2.178-1.555-3.594-1.555-3.179 0-5.515 2.966-4.797 6.045-4.091-.205-7.719-2.165-10.148-5.144-1.29 2.213-.669 5.108 1.523 6.574-.806-.026-1.566-.247-2.229-.616-.054 2.281 1.581 4.415 3.949 4.89-.693.188-1.452.232-2.224.084.626 1.956 2.444 3.379 4.6 3.419-2.07 1.623-4.678 2.348-7.29 2.04 2.179 1.397 4.768 2.212 7.548 2.212 9.142 0 14.307-7.721 13.995-14.646.962-.695 1.797-1.562 2.457-2.549z"/></svg>
                  </span>
                </span>
              </div>
              <p className="text-[10px] text-gray-500">© 2016-2024 GIMT Placement Cell. All rights reserved.</p>
            </div>
          </div>
        </div>

        {/* ================= FLOATING QUICK STATS SIDEBAR (Rightmost Section) ================= */}
        <div className="hidden xl:flex flex-col gap-4 w-[280px] h-full">
          
          {/* Top Image Card */}
          <div className="h-[25%] bg-white rounded-3xl p-2 shadow-md border border-gray-200/60">
            <img 
              src="https://images.unsplash.com/photo-1523240795612-9a054b0db644?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80" 
              alt="Students Event" 
              className="w-full h-full object-cover rounded-[1.2rem]" 
            />
          </div>

          {/* Middle Stats Card */}
          <div className="h-[50%] bg-[#fbf9f4] rounded-3xl shadow-xl border border-gray-200/60 p-7 flex flex-col justify-between relative overflow-hidden">
             
             {/* Background Glow */}
             <div className="absolute -right-10 top-1/2 w-40 h-40 bg-blue-100 rounded-full blur-3xl opacity-60"></div>
             
             <div className="relative z-10 h-full flex flex-col">
               <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-6 flex items-center justify-between">
                 Quick Stats 
                 <Building2 size={16} className="text-gray-400" />
               </h3>

               <div className="flex-1 flex flex-col justify-between">
                 {/* Stat 1 */}
                 <div>
                   <h4 className="text-[2rem] leading-none font-extrabold text-gray-900">5000+</h4>
                   <p className="text-[11px] text-gray-600 font-semibold mt-1">Total Students</p>
                 </div>

                 <div className="w-full h-[1px] bg-gray-200"></div>

                 {/* Stat 2 */}
                 <div>
                   <div className="flex items-end justify-between">
                     <h4 className="text-[2rem] leading-none font-extrabold text-gray-900">250+</h4>
                     <svg width="40" height="20" viewBox="0 0 40 20" className="text-blue-500 mb-1 opacity-80">
                       <path d="M0,15 Q5,5 10,10 T20,10 T30,5 T40,15" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                     </svg>
                   </div>
                   <p className="text-[11px] text-gray-600 font-semibold mt-1">Active Companies</p>
                 </div>

                 <div className="w-full h-[1px] bg-gray-200"></div>

                 {/* Stat 3 */}
                 <div className="flex items-center justify-between">
                   <div>
                     <h4 className="text-[2rem] leading-none font-extrabold text-green-600">85%</h4>
                     <p className="text-[11px] text-gray-600 font-semibold mt-1">Placement %</p>
                   </div>
                   <div className="w-10 h-10 rounded-full border-[5px] border-green-100 border-t-green-500 border-r-green-500 transform rotate-45"></div>
                 </div>
               </div>
             </div>
          </div>

          {/* Bottom Image Card */}
          <div className="h-[25%] bg-white rounded-3xl p-2 shadow-md border border-gray-200/60">
            <img 
              src="https://images.unsplash.com/photo-1542744173-8e7e53415bb0?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80" 
              alt="Recruitment Discussion" 
              className="w-full h-full object-cover rounded-[1.2rem]" 
            />
          </div>
        </div>

      </div>
    </div>
  );
};

export default Login;