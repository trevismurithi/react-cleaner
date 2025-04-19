"use client"
import React, { useEffect, useState } from 'react'
import { doc, getDoc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/auth'
import ShopForm, { ShopFormData } from '@/app/components/forms/ShopForm'

interface Shop {
  id: string;
  name: string;
  email: string;
  phone: string;
  location: string;
  services: string[];
  status: string;
}

export default function EditShop({ onSubmit, onCancel, id }: { onSubmit: () => void, onCancel: () => void, id: string }) {
  const [shop, setShop] = useState<Shop | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    const fetchShop = async () => {
      try {
        const docRef = doc(db, 'shops', id)
        const docSnap = await getDoc(docRef)
        
        if (docSnap.exists()) {
          setShop({
            id: docSnap.id,
            ...docSnap.data()
          } as Shop)
        } else {
          console.error('No such shop!')
          onCancel()
        }
      } catch (error) {
        console.error('Error fetching shop:', error)
        onCancel()
      } finally {
        setLoading(false)
      }
    }

    fetchShop()
  }, [id, onCancel])

  const handleSubmit = async (data: ShopFormData) => {
    try {
      setUpdating(true)
      const docRef = doc(db, 'shops', id)
      await updateDoc(docRef, {
        ...data,
        updatedAt: new Date().toISOString()
      })
      onSubmit()
    } catch (error) {
      console.error('Error updating shop:', error)
    } finally {
      setUpdating(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </div>
    )
  }

  if (!shop) {
    return null
  }

  return (
    <div className="max-w-4xl mx-auto">
      <ShopForm
        onSubmit={handleSubmit}
        onCancel={onCancel}
        initialData={shop}
        isEditing={true}
        isUpdating={updating}
      />
    </div>
  )
} 