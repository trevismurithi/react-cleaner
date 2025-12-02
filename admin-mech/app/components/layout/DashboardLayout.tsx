"use client"
import React, { useState, ReactNode } from 'react'
import {
  LayoutDashboardIcon,
  UserIcon,
  StoreIcon,
  SettingsIcon,
  BellIcon,
  SearchIcon,
  MenuIcon,
  ChevronDownIcon,
  LogOutIcon,
} from 'lucide-react'
import { useAuth } from '@/lib/hooks/useAuth'
import { auth } from '@/lib/firebase/auth'
import { signOut } from 'firebase/auth'

interface DashboardLayoutProps {
  children: ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ 
  children, 
  activeTab, 
  setActiveTab 
}) => {
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true)
  const navItems = [
    {
      id: 'mechanics',
      label: 'Mechanics',
      icon: <UserIcon size={20} />,
    },
    {
      id: 'shops',
      label: 'Shops',
      icon: <StoreIcon size={20} />,
    },
  ]
  const { user } = useAuth()
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)

  const handleSignOut = async () => {
    try {
      await signOut(auth)
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Mobile sidebar toggle */}
      <div className="lg:hidden fixed top-0 left-0 z-20 p-4">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-2 rounded-md bg-white shadow"
        >
          <MenuIcon size={20} />
        </button>
      </div>
      {/* Sidebar */}
      <div
        className={`${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} 
        lg:translate-x-0 fixed lg:static inset-y-0 left-0 z-10 w-64 transition-transform 
        duration-300 ease-in-out bg-white shadow-lg`}
      >
        <div className="flex items-center justify-center h-16 border-b">
          <LayoutDashboardIcon className="mr-2 text-blue-600" />
          <h1 className="text-xl font-bold text-gray-800">Auto Admin</h1>
        </div>
        <nav className="mt-6">
          <div className="px-4 mb-6">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Management
            </p>
            <ul className="mt-3">
              {navItems.map((item) => (
                <li key={item.id} className="mb-2">
                  <button
                    onClick={() => setActiveTab(item.id)}
                    className={`flex items-center w-full px-4 py-2 rounded-lg transition-colors ${activeTab === item.id ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-100'}`}
                  >
                    <span className="mr-3">{item.icon}</span>
                    <span>{item.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="px-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              System
            </p>
            <ul className="mt-3">
              <li className="mb-2">
                <button className="flex items-center w-full px-4 py-2 text-gray-600 rounded-lg hover:bg-gray-100">
                  <SettingsIcon size={20} className="mr-3" />
                  <span>Settings</span>
                </button>
              </li>
            </ul>
          </div>
        </nav>
      </div>
      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top header */}
        <header className="flex items-center justify-between h-16 px-4 bg-white border-b">
          <div className="flex items-center w-72">
            <div className="relative">
              <SearchIcon
                size={18}
                className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                placeholder="Search..."
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          <div className="flex items-center">
            <button className="p-2 mr-2 text-gray-500 rounded-full hover:bg-gray-100">
              <BellIcon size={20} />
            </button>
            <div className="relative">
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="flex items-center space-x-2 p-2 rounded-full hover:bg-gray-100"
              >
                <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center">
                  {user?.email?.charAt(0).toUpperCase() || 'A'}
                </div>
                <ChevronDownIcon size={16} className="text-gray-500" />
              </button>
              
              {isDropdownOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1">
                  <div className="px-4 py-2 text-sm text-gray-700 border-b">
                    {user?.email}
                  </div>
                  <button
                    onClick={handleSignOut}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                  >
                    <LogOutIcon size={16} className="mr-2" />
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        {/* Main content area */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-gray-100">
          {children}
        </main>
      </div>
    </div>
  )
}
