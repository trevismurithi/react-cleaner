"use client"
import React, { useState, useEffect } from 'react'
import { PlusIcon, SearchIcon, PencilIcon } from 'lucide-react'
import { collection, getDocs, query, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase/auth'

interface Mechanic {
  id: string;
  name: string;
  email: string;
  phone: string;
  specialization: string;
  experience: number;
  status: string;
  location: string;
  createdAt: string;
}

interface MechanicsTableProps {
  onAddClick: () => void;
  onEditClick: (id: string) => void;
}

export const MechanicsTable: React.FC<MechanicsTableProps> = ({ onAddClick, onEditClick }) => {
  const [mechanics, setMechanics] = useState<Mechanic[]>([])
  const [searchTerm, setSearchTerm] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchMechanics = async () => {
      try {
        const mechanicsRef = collection(db, 'mechanics')
        const q = query(mechanicsRef, orderBy('createdAt', 'desc'))
        const querySnapshot = await getDocs(q)
        
        const mechanicsData = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Mechanic[]
        
        setMechanics(mechanicsData)
      } catch (error) {
        console.error('Error fetching mechanics:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchMechanics()
  }, [])

  const handleEdit = (mechanic: Mechanic) => {
    onEditClick(mechanic.id)
  }

  const filteredMechanics = mechanics.filter(
    (mechanic) =>
      mechanic.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      mechanic.specialization.toLowerCase().includes(searchTerm.toLowerCase()) ||
      mechanic.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      mechanic.location.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b border-gray-200">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
          <h2 className="text-xl font-bold text-gray-800 mb-4 md:mb-0">
            Registered Mechanics
          </h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative">
              <SearchIcon
                size={18}
                className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                placeholder="Search mechanics..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 w-full sm:w-64 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <button
              onClick={onAddClick}
              className="flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <PlusIcon size={18} className="mr-2" />
              Add Mechanic
            </button>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Contact
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Specialization
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Experience
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Location
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredMechanics.length > 0 ? (
              filteredMechanics.map((mechanic) => (
                <tr key={mechanic.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="h-10 w-10 flex-shrink-0 rounded-full bg-gray-200 flex items-center justify-center">
                        <span className="font-medium text-gray-600">
                          {mechanic.name.charAt(0)}
                        </span>
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">
                          {mechanic.name}
                        </div>
                        <div className="text-sm text-gray-500">
                          ID: {mechanic.id}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {mechanic.email}
                    </div>
                    <div className="text-sm text-gray-500">
                      {mechanic.phone}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                      {mechanic.specialization}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {mechanic.experience} years
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-purple-100 text-purple-800">
                      {mechanic.location}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${mechanic.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
                    >
                      {mechanic.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => handleEdit(mechanic)}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      <PencilIcon size={16} />
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={7}
                  className="px-6 py-4 text-center text-sm text-gray-500"
                >
                  No mechanics found matching your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="px-6 py-4 border-t border-gray-200">
        <div className="text-sm text-gray-500">
          Showing{' '}
          <span className="font-medium">{filteredMechanics.length}</span> of{' '}
          <span className="font-medium">{mechanics.length}</span> mechanics
        </div>
      </div>
    </div>
  )
}
