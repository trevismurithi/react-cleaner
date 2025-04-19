"use client"
import React from 'react'
import { useForm } from 'react-hook-form'
import { ArrowLeftIcon, PlusIcon, XIcon } from 'lucide-react'
import { collection, addDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/auth'

export interface ShopFormData {
  name: string;
  email: string;
  phone: string;
  location: string;
  services: string[];
  status: string;
}

interface ShopFormProps {
  onSubmit: (data: ShopFormData) => void;
  onCancel: () => void;
  initialData?: ShopFormData;
  isEditing?: boolean;
  isUpdating?: boolean;
}

export default function ShopForm({ onSubmit, onCancel, initialData, isEditing = false, isUpdating = false }: ShopFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
    setValue,
    watch
  } = useForm<ShopFormData>({
    defaultValues: initialData || {
      name: '',
      email: '',
      phone: '',
      location: '',
      services: [],
      status: 'Active'
    }
  })

  const services = watch('services')
  const [newService, setNewService] = React.useState('')

  const addService = () => {
    if (newService.trim()) {
      setValue('services', [...services, newService.trim()])
      setNewService('')
    }
  }

  const removeService = (indexToRemove: number) => {
    setValue('services', services.filter((_, index) => index !== indexToRemove))
  }

  const submitForm = async (data: ShopFormData) => {
    try {
      if (!isEditing) {
        await addDoc(collection(db, 'shops'), {
          ...data,
          createdAt: new Date().toISOString()
        })
      }
      onSubmit(data)
    } catch (error) {
      const firestoreError = error as { message: string }
      setError('root', {
        type: 'manual',
        message: firestoreError.message || 'Failed to save shop. Please try again.'
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
            {isEditing ? 'Edit Shop' : 'Register New Shop'}
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
              Shop Name
            </label>
            <input
              type="text"
              id="name"
              {...register('name', {
                required: 'Shop name is required',
                minLength: {
                  value: 2,
                  message: 'Shop name must be at least 2 characters'
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
              htmlFor="location"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Location
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
              <option value="Murang'a">Murang&apos;a</option>
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
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Services Offered
            </label>
            <div className="flex">
              <input
                type="text"
                value={newService}
                onChange={(e) => setNewService(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addService()
                  }
                }}
                placeholder="Add a service..."
                className="flex-grow px-3 py-2 border rounded-l-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
              />
              <button
                type="button"
                onClick={addService}
                className="px-4 py-2 bg-blue-600 text-white rounded-r-lg hover:bg-blue-700"
              >
                <PlusIcon size={20} />
              </button>
            </div>
            {errors.services && (
              <p className="mt-1 text-sm text-red-600">{errors.services.message}</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {services.map((service, index) => (
                <div
                  key={index}
                  className="flex items-center bg-blue-100 text-blue-800 rounded-full px-3 py-1"
                >
                  <span className="text-sm">{service}</span>
                  <button
                    type="button"
                    onClick={() => removeService(index)}
                    className="ml-2 text-blue-600 hover:text-blue-800"
                  >
                    <XIcon size={16} />
                  </button>
                </div>
              ))}
            </div>
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
            disabled={isSubmitting || isUpdating}
            className={`px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 ${(isSubmitting || isUpdating) ? 'opacity-75 cursor-not-allowed' : ''}`}
          >
            {isSubmitting || isUpdating ? 'Saving...' : isEditing ? 'Update Shop' : 'Register Shop'}
          </button>
        </div>
      </form>
    </div>
  )
}

