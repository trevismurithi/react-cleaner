"use client"
import React, { useState } from 'react'
import { DashboardLayout } from './components/layout/DashboardLayout'
import { MechanicsTable } from './components/tables/MechanicsTable'
import { ShopsTable } from './components/tables/ShopsTable'
import MechanicForm from './components/forms/MechanicForm'
import ShopForm from './components/forms/ShopForm'
import EditMechanic from './components/forms/MechanicFormEdit'

enum MechanicFormState {
  None = 'none',
  Adding = 'adding',
  Editing = 'editing'
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<string>('mechanics')
  const [mechanicFormState, setMechanicFormState] = useState<MechanicFormState>(MechanicFormState.None)
  const [editingMechanicId, setEditingMechanicId] = useState<string>('')
  const [isAddingShop, setIsAddingShop] = useState<boolean>(false)

  return (
    <DashboardLayout activeTab={activeTab} setActiveTab={setActiveTab}>
      {activeTab === 'mechanics' && (
        <>
          {mechanicFormState === MechanicFormState.Adding && (
            <MechanicForm
              onSubmit={() => setMechanicFormState(MechanicFormState.None)}
              onCancel={() => setMechanicFormState(MechanicFormState.None)}
              isEditing={false}
            />
          )}
          {mechanicFormState === MechanicFormState.Editing && (
            <EditMechanic
              onSubmit={() => setMechanicFormState(MechanicFormState.None)}
              onCancel={() => setMechanicFormState(MechanicFormState.None)}
              id={editingMechanicId}
            />
          )}
          {mechanicFormState === MechanicFormState.None && (
            <MechanicsTable
              onAddClick={() => setMechanicFormState(MechanicFormState.Adding)}
              onEditClick={(id) => {
                setEditingMechanicId(id)
                setMechanicFormState(MechanicFormState.Editing)
              }}
            />
          )}
        </>
      )}
      {activeTab === 'shops' && (
        <>
          {isAddingShop ? (
            <ShopForm
              onSubmit={() => setIsAddingShop(false)}
              onCancel={() => setIsAddingShop(false)}
            />
          ) : (
            <ShopsTable
              onAddClick={() => setIsAddingShop(true)}
            />
          )}
        </>
      )}
    </DashboardLayout>
  )
}
