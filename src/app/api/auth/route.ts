import { NextResponse } from 'next/server'
import { signIn, signOut } from '@/lib/supabase-auth'

// POST /api/auth — login
export async function POST(request: Request) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email y contraseña son requeridos' },
        { status: 400 }
      )
    }

    const { user, session, error } = await signIn(email, password)

    if (error) {
      return NextResponse.json({ error }, { status: 401 })
    }

    return NextResponse.json({
      user: {
        id: user?.id,
        email: user?.email,
      },
      token: session?.access_token,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// DELETE /api/auth — logout
export async function DELETE() {
  try {
    const { error } = await signOut()
    if (error) {
      return NextResponse.json({ error }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
