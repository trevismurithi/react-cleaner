"use client"
import React, { useState, useEffect } from 'react'
import { PlusIcon, SearchIcon, PencilIcon } from 'lucide-react'
import { collection, getDocs, query, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase/auth'
import ShopFormEdit from '@/app/components/forms/ShopFormEdit'

interface Shop {
  id: string;
  name: string;
  email: string;
  phone: string;
  location: string;
  services: string[];
  status: string;
  createdAt: string;
}

interface ShopsTableProps {
  onAddClick: () => void;
}

export const ShopsTable: React.FC<ShopsTableProps> = ({ onAddClick }) => {
  const [shops, setShops] = useState<Shop[]>([])
  const [searchTerm, setSearchTerm] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingShopId, setEditingShopId] = useState<string | null>(null)

  const fetchShops = async () => {
    try {
      const shopsQuery = query(collection(db, 'shops'), orderBy('createdAt', 'desc'))
      const querySnapshot = await getDocs(shopsQuery)
      const shopsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Shop[]
      setShops(shopsData)
    } catch (err) {
      const firestoreError = err as { message: string }
      setError(firestoreError.message || 'Failed to fetch shops')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchShops()
  }, [])

  const handleEdit = (shopId: string) => {
    setEditingShopId(shopId)
  }

  const handleEditComplete = () => {
    setEditingShopId(null)
    fetchShops() // Refresh the table data
  }

  const filteredShops = shops.filter(
    (shop) =>
      shop.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      shop.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
      shop.services.some((service) =>
        service.toLowerCase().includes(searchTerm.toLowerCase())
      )
  )

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="text-center text-red-600">
          <p>{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (editingShopId) {
    const shopToEdit = shops.find(shop => shop.id === editingShopId)
    if (!shopToEdit) return null

    return (
      <div className="max-w-4xl mx-auto">
        <ShopFormEdit
          id={editingShopId}
          onSubmit={handleEditComplete}
          onCancel={() => setEditingShopId(null)}
        />
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b border-gray-200">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
          <h2 className="text-xl font-bold text-gray-800 mb-4 md:mb-0">
            Mechanical Shops
          </h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative">
              <SearchIcon
                size={18}
                className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                placeholder="Search shops..."
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
              Add Shop
            </button>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Shop
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Contact
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Location
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Services
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
            {filteredShops.length > 0 ? (
              filteredShops.map((shop) => (
                <tr key={shop.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="h-10 w-10 flex-shrink-0 rounded-full bg-gray-200 flex items-center justify-center">
                        <span className="font-medium text-gray-600">
                          {shop.name.charAt(0)}
                        </span>
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">
                          {shop.name}
                        </div>
                        <div className="text-sm text-gray-500">
                          ID: {shop.id}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{shop.email}</div>
                    <div className="text-sm text-gray-500">{shop.phone}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {shop.location}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {shop.services.map((service, index) => (
                        <span
                          key={index}
                          className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800"
                        >
                          {service}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${shop.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
                    >
                      {shop.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => handleEdit(shop.id)}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      <PencilIcon size={18} />
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={6}
                  className="px-6 py-4 text-center text-sm text-gray-500"
                >
                  No shops found matching your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="px-6 py-4 border-t border-gray-200">
        <div className="text-sm text-gray-500">
          Showing <span className="font-medium">{filteredShops.length}</span> of{' '}
          <span className="font-medium">{shops.length}</span> shops
        </div>
      </div>
    </div>
  )
}
