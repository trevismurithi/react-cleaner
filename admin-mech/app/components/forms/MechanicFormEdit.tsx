"use client"
import React, { useEffect, useState } from 'react'
import { doc, getDoc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/auth'
import MechanicForm, { MechanicFormData } from '@/app/components/forms/MechanicForm'

interface Mechanic {
  id: string;
  name: string;
  email: string;
  phone: string;
  specialization: string;
  experience: number;
  status: string;
  location: string;
}

export default function EditMechanic({ onSubmit, onCancel, id }: { onSubmit: () => void, onCancel: () => void, id: string }) {
  const [mechanic, setMechanic] = useState<Mechanic | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchMechanic = async () => {
      try {
        const docRef = doc(db, 'mechanics', id)
        const docSnap = await getDoc(docRef)
        
        if (docSnap.exists()) {
          setMechanic({
            id: docSnap.id,
            ...docSnap.data()
          } as Mechanic)
        } else {
          console.error('No such mechanic!')
          onCancel()
        }
      } catch (error) {
        console.error('Error fetching mechanic:', error)
        onCancel()
      } finally {
        setLoading(false)
      }
    }

    fetchMechanic()
  }, [id, onCancel])

  const handleSubmit = async (data: MechanicFormData) => {
    try {
      const docRef = doc(db, 'mechanics', id)
      await updateDoc(docRef, {
        ...data,
        updatedAt: new Date().toISOString()
      })
      onSubmit()
    } catch (error) {
      console.error('Error updating mechanic:', error)
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

  if (!mechanic) {
    return null
  }

  return (
    <div className="max-w-4xl mx-auto">
      <MechanicForm
        onSubmit={handleSubmit}
        onCancel={onCancel}
        initialData={mechanic}
        isEditing={true}
      />
    </div>
  )
} 