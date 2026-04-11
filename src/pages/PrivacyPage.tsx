import { Link } from 'react-router'
import { Shield, ArrowLeft } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export function PrivacyPage() {
  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-2">
          <Link to="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          </Link>
        </div>

        <div className="text-center space-y-2">
          <div className="mx-auto h-12 w-12 rounded-full bg-primary flex items-center justify-center">
            <Shield className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold">Privacy Policy</h1>
          <p className="text-muted-foreground">Last updated: April 2026</p>
        </div>

        <Card>
          <CardContent className="prose prose-sm max-w-none pt-6 space-y-6">
            <section>
              <h2 className="text-lg font-semibold">What we collect</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                We collect only what is necessary to provide the service:
              </p>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li><strong>Account info</strong> — your name and email address</li>
                <li><strong>Expense data</strong> — amounts, categories, dates, and descriptions you enter</li>
                <li><strong>File attachments</strong> — receipts, contracts, and photos you upload</li>
                <li><strong>Mortgage data</strong> — loan details and rate history you configure</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold">Why we collect it</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Your data is used solely to provide the house expense tracking service. We do not use your data for advertising, profiling, or any other purpose.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold">Where your data is stored</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Your data is stored on Google Cloud infrastructure (Firebase) with industry-standard security:
              </p>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li><strong>Encryption at rest</strong> — all data is encrypted using AES-256</li>
                <li><strong>Encryption in transit</strong> — all connections use TLS/HTTPS</li>
                <li><strong>Access control</strong> — only household members you invite can see your data</li>
                <li><strong>File protection</strong> — attachments are access-controlled and not publicly accessible</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold">Who can see your data</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Only members of your household can see your expenses and attachments. Household membership is controlled by you through invite links. No one outside your household — including app administrators — can access your expense details, amounts, or attachments.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold">How long we keep it</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Your data is stored for as long as your account exists. When you delete your account, all your personal data — profile, expenses, and attachments — is permanently removed.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold">Your rights</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Under GDPR and applicable data protection laws, you have the right to:
              </p>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li><strong>Access your data</strong> — view all your data in the app at any time</li>
                <li><strong>Export your data</strong> — download all your data from Settings</li>
                <li><strong>Delete your data</strong> — permanently delete your account from Settings</li>
                <li><strong>Withdraw consent</strong> — delete your account at any time</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold">Third-party services</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                We use Firebase (by Google) to operate the app:
              </p>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li><strong>Firebase Authentication</strong> — for secure sign-in</li>
                <li><strong>Firebase Cloud Firestore</strong> — for data storage</li>
                <li><strong>Firebase Cloud Storage</strong> — for file attachments</li>
              </ul>
              <p className="text-sm text-muted-foreground leading-relaxed mt-2">
                Firebase is part of Google Cloud Platform (Alphabet Inc.) and complies with GDPR through standard contractual clauses.
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed mt-2">
                We do not use analytics, tracking cookies, or advertising services. We do not sell or share your data with third parties.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold">Contact</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                For any questions about your data or this privacy policy, contact us at{' '}
                <a href="mailto:privacy@houseexpenses.app" className="text-primary hover:underline">
                  privacy@houseexpenses.app
                </a>
              </p>
            </section>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
