# Auto Admin - Automotive Management System

A comprehensive web application for managing automotive mechanics and shops, built with Next.js and Firebase.

## Features

- 🔐 **Authentication System**
  - Secure login with Firebase Authentication
  - Protected routes and session management
  - User profile management

- 🛠️ **Mechanics Management**
  - Add, edit, and view mechanic details
  - Track mechanic specialization and experience
  - Manage mechanic status (Active/Inactive)

- 🏪 **Shop Management**
  - Register and manage automotive shops
  - Track shop locations across Kenyan counties
  - Manage shop services and status

- 📊 **Dashboard**
  - Real-time data visualization
  - Search and filter functionality
  - Responsive design for all devices

## Tech Stack

- **Frontend**: Next.js, React, TypeScript
- **Styling**: Tailwind CSS
- **Authentication**: Firebase Authentication
- **Database**: Firebase Firestore
- **Deployment**: Vercel

## Getting Started

### Prerequisites

- Node.js (v14 or later)
- npm or yarn
- Firebase account

### Installation

1. Clone the repository
```bash
git clone https://github.com/yourusername/auto-admin.git
cd auto-admin
```

2. Install dependencies
```bash
npm install
# or
yarn install
```

3. Set up environment variables
Create a `.env` file in the root directory with the following Firebase configuration:
```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your_measurement_id
```

4. Run the development server
```bash
npm run dev
# or
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Project Structure

```
auto-admin/
├── app/                    # Next.js app directory
│   ├── auth/              # Authentication pages
│   ├── components/        # Reusable components
│   │   ├── auth/         # Auth-related components
│   │   ├── forms/        # Form components
│   │   ├── layout/       # Layout components
│   │   └── tables/       # Table components
│   └── lib/              # Utility functions and hooks
├── public/                # Static assets
└── lib/                   # Firebase configuration
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contact

Your Name - [@yourtwitter](https://twitter.com/yourtwitter)

Project Link: [https://github.com/yourusername/auto-admin](https://github.com/yourusername/auto-admin)
