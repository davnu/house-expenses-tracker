import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Shield, ArrowLeft } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export function PrivacyPage() {
  const { t } = useTranslation()

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-2">
          <Link to="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" />
              {t('common.back')}
            </Button>
          </Link>
        </div>

        <div className="text-center space-y-2">
          <div className="mx-auto h-12 w-12 rounded-full bg-primary flex items-center justify-center">
            <Shield className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold">{t('common.privacyPolicy')}</h1>
          <p className="text-muted-foreground">{t('privacy.lastUpdated')}</p>
        </div>

        <Card>
          <CardContent className="prose prose-sm max-w-none pt-6 space-y-6">
            <section>
              <h2 className="text-lg font-semibold">{t('privacy.whatWeCollect')}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t('privacy.whatWeCollectIntro')}
              </p>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li><strong>{t('privacy.accountInfo').replace(/<\/?0>/g, '').split(' — ')[0]}</strong> — {t('privacy.accountInfo').replace(/<\/?0>/g, '').split(' — ')[1]}</li>
                <li><strong>{t('privacy.expenseData').replace(/<\/?0>/g, '').split(' — ')[0]}</strong> — {t('privacy.expenseData').replace(/<\/?0>/g, '').split(' — ')[1]}</li>
                <li><strong>{t('privacy.fileAttachments').replace(/<\/?0>/g, '').split(' — ')[0]}</strong> — {t('privacy.fileAttachments').replace(/<\/?0>/g, '').split(' — ')[1]}</li>
                <li><strong>{t('privacy.mortgageData').replace(/<\/?0>/g, '').split(' — ')[0]}</strong> — {t('privacy.mortgageData').replace(/<\/?0>/g, '').split(' — ')[1]}</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold">{t('privacy.whyWeCollect')}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t('privacy.whyWeCollectText')}
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold">{t('privacy.whereStored')}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t('privacy.whereStoredIntro')}
              </p>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li><strong>{t('privacy.encryptionAtRest').replace(/<\/?0>/g, '').split(' — ')[0]}</strong> — {t('privacy.encryptionAtRest').replace(/<\/?0>/g, '').split(' — ')[1]}</li>
                <li><strong>{t('privacy.encryptionInTransit').replace(/<\/?0>/g, '').split(' — ')[0]}</strong> — {t('privacy.encryptionInTransit').replace(/<\/?0>/g, '').split(' — ')[1]}</li>
                <li><strong>{t('privacy.accessControl').replace(/<\/?0>/g, '').split(' — ')[0]}</strong> — {t('privacy.accessControl').replace(/<\/?0>/g, '').split(' — ')[1]}</li>
                <li><strong>{t('privacy.fileProtection').replace(/<\/?0>/g, '').split(' — ')[0]}</strong> — {t('privacy.fileProtection').replace(/<\/?0>/g, '').split(' — ')[1]}</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold">{t('privacy.whoCanSee')}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t('privacy.whoCanSeeText')}
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold">{t('privacy.howLongKeep')}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t('privacy.howLongKeepText')}
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold">{t('privacy.yourRights')}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t('privacy.yourRightsIntro')}
              </p>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li><strong>{t('privacy.accessData').replace(/<\/?0>/g, '').split(' — ')[0]}</strong> — {t('privacy.accessData').replace(/<\/?0>/g, '').split(' — ')[1]}</li>
                <li><strong>{t('privacy.exportData').replace(/<\/?0>/g, '').split(' — ')[0]}</strong> — {t('privacy.exportData').replace(/<\/?0>/g, '').split(' — ')[1]}</li>
                <li><strong>{t('privacy.deleteData').replace(/<\/?0>/g, '').split(' — ')[0]}</strong> — {t('privacy.deleteData').replace(/<\/?0>/g, '').split(' — ')[1]}</li>
                <li><strong>{t('privacy.withdrawConsent').replace(/<\/?0>/g, '').split(' — ')[0]}</strong> — {t('privacy.withdrawConsent').replace(/<\/?0>/g, '').split(' — ')[1]}</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold">{t('privacy.thirdParty')}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t('privacy.thirdPartyIntro')}
              </p>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li><strong>{t('privacy.firebaseAuth').replace(/<\/?0>/g, '').split(' — ')[0]}</strong> — {t('privacy.firebaseAuth').replace(/<\/?0>/g, '').split(' — ')[1]}</li>
                <li><strong>{t('privacy.firebaseFirestore').replace(/<\/?0>/g, '').split(' — ')[0]}</strong> — {t('privacy.firebaseFirestore').replace(/<\/?0>/g, '').split(' — ')[1]}</li>
                <li><strong>{t('privacy.firebaseStorage').replace(/<\/?0>/g, '').split(' — ')[0]}</strong> — {t('privacy.firebaseStorage').replace(/<\/?0>/g, '').split(' — ')[1]}</li>
              </ul>
              <p className="text-sm text-muted-foreground leading-relaxed mt-2">
                {t('privacy.firebaseGDPR')}
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed mt-2">
                {t('privacy.noTracking')}
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold">{t('privacy.contact')}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t('privacy.contactText')}{' '}
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
