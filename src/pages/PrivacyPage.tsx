import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Shield, ShieldCheck, ArrowLeft, Lock, BadgeCheck, Users, Trash2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAnalytics } from '@/hooks/useAnalytics'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { PRIVACY_TITLE } from '@/lib/page-titles'

export function PrivacyPage() {
  const { t } = useTranslation()
  useDocumentTitle(PRIVACY_TITLE)
  useAnalytics()

  const securityFeatures = [
    { icon: Lock, titleKey: 'secureEncryption', textKey: 'secureEncryptionText' },
    { icon: BadgeCheck, titleKey: 'secureCertified', textKey: 'secureCertifiedText' },
    { icon: Users, titleKey: 'secureAccess', textKey: 'secureAccessText' },
    { icon: Trash2, titleKey: 'secureDelete', textKey: 'secureDeleteText' },
  ]

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

        {/* ═══ SECURITY HERO — the big trust statement, front and center ═══ */}
        <Card className="overflow-hidden border-brand/20 shadow-[0_8px_32px_-12px_rgba(134,59,255,0.25)]">
          <div className="bg-gradient-to-br from-brand/[0.08] via-brand/[0.04] to-transparent px-6 sm:px-8 py-8 sm:py-10 text-center">
            <div className="mx-auto h-14 w-14 rounded-2xl bg-brand text-white flex items-center justify-center mb-4 shadow-[0_8px_24px_-6px_rgba(134,59,255,0.5)]">
              <ShieldCheck className="h-7 w-7" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-balance">
              {t('privacy.secureHeroTitle')}
            </h2>
            <p className="mt-4 text-sm sm:text-[15px] text-muted-foreground leading-relaxed max-w-xl mx-auto">
              {t('privacy.secureHeroSubtitle')}
            </p>
          </div>
          <CardContent className="pt-6 pb-6">
            <div className="grid sm:grid-cols-2 gap-4">
              {securityFeatures.map((f) => (
                <div key={f.titleKey} className="flex items-start gap-3">
                  <div className="h-9 w-9 shrink-0 rounded-xl bg-brand/10 flex items-center justify-center">
                    <f.icon className="h-4 w-4 text-brand" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm">{t(`privacy.${f.titleKey}`)}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                      {t(`privacy.${f.textKey}`)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ═══ Detailed sections — same as before, minus the flashy inspector ═══ */}
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

            {/* Analytics disclosure — plain prose, tucked below the main content */}
            <section>
              <h2 className="text-lg font-semibold">{t('privacy.websiteSection')}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t('privacy.websiteAnalytics')}
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold">{t('privacy.contact')}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t('privacy.contactText')}{' '}
                <a href="mailto:david@nualsolutions.com" className="text-primary hover:underline">
                  david@nualsolutions.com
                </a>
              </p>
            </section>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
