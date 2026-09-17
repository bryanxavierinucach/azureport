import { redirect } from 'next/navigation';
import { isAuthenticated } from '../auth';
import LoginForm from './login-form';

export default async function LoginPage() {
  if (await isAuthenticated()) redirect('/');
  return <main className="grid min-h-screen place-items-center bg-[#eef3f9] px-5"><LoginForm /></main>;
}
