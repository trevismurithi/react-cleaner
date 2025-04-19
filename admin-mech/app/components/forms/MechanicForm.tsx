"use client"
import React, { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { ArrowLeftIcon } from 'lucide-react'
import { collection, addDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/auth'

export interface MechanicFormData {
  name: string;
  email: string;
  phone: string;
  specialization: string;
  experience: number;
  status: string;
  location: string;
}

interface MechanicFormProps {
  onSubmit: (data: MechanicFormData) => void;
  onCancel: () => void;
  initialData?: MechanicFormData;
  isEditing?: boolean;
}

export default function MechanicForm({ onSubmit, onCancel, initialData, isEditing }: MechanicFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
    reset
  } = useForm<MechanicFormData>({
    defaultValues: initialData || {
      name: '',
      email: '',
      phone: '',
      specialization: '',
      experience: 0,
      status: 'Active',
      location: ''
    }
  })

  useEffect(() => {
    if (initialData) {
      reset(initialData)
    }
  }, [initialData, reset])

  const submitForm = async (data: MechanicFormData) => {
    try {
      if (isEditing) {
        onSubmit(data)
      } else {
        await addDoc(collection(db, 'mechanics'), {
          ...data,
          createdAt: new Date().toISOString()
        })
        onSubmit(data)
      }
      
    } catch (error) {
      const firestoreError = error as { message: string }
      setError('root', {
        type: 'manual',
        message: firestoreError.message || 'Failed to save mechanic. Please try again.'
      })
    }
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center">
          <button
            type="button"
            onClick={onCancel}
            className="mr-4 p-2 rounded-full hover:bg-gray-100"
          >
            <ArrowLeftIcon size={20} />
          </button>
          <h2 className="text-xl font-bold text-gray-800">
            Register New Mechanic
          </h2>
        </div>
      </div>
      <form onSubmit={handleSubmit(submitForm)} className="p-6">
        {errors.root && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-800 rounded-md p-4 text-sm">
            {errors.root.message}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Full Name
            </label>
            <input
              type="text"
              id="name"
              {...register('name', {
                required: 'Name is required',
                minLength: {
                  value: 2,
                  message: 'Name must be at least 2 characters'
                }
              })}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 text-black ${errors.name ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'}`}
            />
            {errors.name && (
              <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
            )}
          </div>
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Email Address
            </label>
            <input
              type="email"
              id="email"
              {...register('email', {
                required: 'Email is required',
                pattern: {
                  value: /\S+@\S+\.\S+/,
                  message: 'Email is invalid'
                }
              })}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 text-black ${errors.email ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'}`}
            />
            {errors.email && (
              <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
            )}
          </div>
          <div>
            <label
              htmlFor="phone"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Phone Number
            </label>
            <input
              type="tel"
              id="phone"
              {...register('phone', {
                required: 'Phone number is required',
                pattern: {
                  value: /^[0-9]{10}$/,
                  message: 'Phone number must be 10 digits'
                }
              })}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 text-black ${errors.phone ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'}`}
            />
            {errors.phone && (
              <p className="mt-1 text-sm text-red-600">{errors.phone.message}</p>
            )}
          </div>
          <div>
            <label
              htmlFor="specialization"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Specialization
            </label>
            <select
              id="specialization"
              {...register('specialization', {
                required: 'Specialization is required'
              })}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 text-black ${errors.specialization ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'}`}
            >
              <option value="">Select a specialization</option>
              <option value="Engine Repair">Engine Repair</option>
              <option value="Transmission">Transmission</option>
              <option value="Electrical Systems">Electrical Systems</option>
              <option value="Brake Systems">Brake Systems</option>
              <option value="General Maintenance">General Maintenance</option>
              <option value="Body Work">Body Work</option>
            </select>
            {errors.specialization && (
              <p className="mt-1 text-sm text-red-600">{errors.specialization.message}</p>
            )}
          </div>
          <div>
            <label
              htmlFor="experience"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Years of Experience
            </label>
            <input
              type="number"
              id="experience"
              {...register('experience', {
                required: 'Experience is required',
                min: {
                  value: 0,
                  message: 'Experience cannot be negative'
                },
                valueAsNumber: true
              })}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 text-black ${errors.experience ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'}`}
            />
            {errors.experience && (
              <p className="mt-1 text-sm text-red-600">{errors.experience.message}</p>
            )}
          </div>
          <div>
            <label
              htmlFor="status"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Status
            </label>
            <select
              id="status"
              {...register('status')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>
          <div>
            <label
              htmlFor="location"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Location (County)
            </label>
            <select
              id="location"
              {...register('location', {
                required: 'Location is required'
              })}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 text-black ${errors.location ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'}`}
            >
              <option value="">Select a county</option>
              <option value="Mombasa">Mombasa</option>
              <option value="Kwale">Kwale</option>
              <option value="Kilifi">Kilifi</option>
              <option value="Tana River">Tana River</option>
              <option value="Lamu">Lamu</option>
              <option value="Taita-Taveta">Taita-Taveta</option>
              <option value="Garissa">Garissa</option>
              <option value="Wajir">Wajir</option>
              <option value="Mandera">Mandera</option>
              <option value="Marsabit">Marsabit</option>
              <option value="Isiolo">Isiolo</option>
              <option value="Meru">Meru</option>
              <option value="Tharaka-Nithi">Tharaka-Nithi</option>
              <option value="Embu">Embu</option>
              <option value="Kitui">Kitui</option>
              <option value="Machakos">Machakos</option>
              <option value="Makueni">Makueni</option>
              <option value="Nyandarua">Nyandarua</option>
              <option value="Nyeri">Nyeri</option>
              <option value="Kirinyaga">Kirinyaga</option>
              <option value="Murang'a">Murang{"'"}a</option>
              <option value="Kiambu">Kiambu</option>
              <option value="Turkana">Turkana</option>
              <option value="West Pokot">West Pokot</option>
              <option value="Samburu">Samburu</option>
              <option value="Trans Nzoia">Trans Nzoia</option>
              <option value="Uasin Gishu">Uasin Gishu</option>
              <option value="Elgeyo-Marakwet">Elgeyo-Marakwet</option>
              <option value="Nandi">Nandi</option>
              <option value="Baringo">Baringo</option>
              <option value="Laikipia">Laikipia</option>
              <option value="Nakuru">Nakuru</option>
              <option value="Narok">Narok</option>
              <option value="Kajiado">Kajiado</option>
              <option value="Kericho">Kericho</option>
              <option value="Bomet">Bomet</option>
              <option value="Kakamega">Kakamega</option>
              <option value="Vihiga">Vihiga</option>
              <option value="Bungoma">Bungoma</option>
              <option value="Busia">Busia</option>
              <option value="Siaya">Siaya</option>
              <option value="Kisumu">Kisumu</option>
              <option value="Homa Bay">Homa Bay</option>
              <option value="Migori">Migori</option>
              <option value="Kisii">Kisii</option>
              <option value="Nyamira">Nyamira</option>
              <option value="Nairobi">Nairobi</option>
            </select>
            {errors.location && (
              <p className="mt-1 text-sm text-red-600">{errors.location.message}</p>
            )}
          </div>
        </div>
        <div className="mt-8 flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 mr-4 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className={`px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 ${isSubmitting ? 'opacity-75 cursor-not-allowed' : ''}`}
          >
            {isSubmitting ? 'Saving...' : 'Register Mechanic'}
          </button>
        </div>
      </form>
    </div>
  )
}
