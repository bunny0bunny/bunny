import {expect,mock,test} from 'bun:test';
import {renderToStaticMarkup} from 'react-dom/server';
mock.module('server-only',()=>({}));
mock.module('next/navigation',()=>({useRouter:()=>({refresh:()=>{},replace:()=>{}}),usePathname:()=>'/translators/team'}));
mock.module('../../src/lib/public-identities/actions',()=>({setIdentityFollow:async()=>({ok:true}),setIdentityAlerts:async()=>({ok:true})}));
const {FollowControls}=await import('../../src/components/public-identities/follow-controls');
test('guest following requires sign-in with safe same-site return path',()=>{const html=renderToStaticMarkup(<FollowControls identityId="public-id" initialFollow={{following:false,alertsEnabled:false}} canFollow={false} returnTo="/translators/team"/>);expect(html).toContain('/login?next=%2Ftranslators%2Fteam');expect(html).toContain('سجّل الدخول للمتابعة');expect(html).not.toContain('كتم تنبيهات');});
test('muted follow stays followed and offers explicit alert resumption',()=>{const html=renderToStaticMarkup(<FollowControls identityId="public-id" initialFollow={{following:true,alertsEnabled:false}} canFollow={true} returnTo="/translators/team"/>);expect(html).toContain('إلغاء المتابعة');expect(html).toContain('تفعيل تنبيهات النشر');expect(html).toContain('مكتومة');});
test('suspended identity allows unfollow while withholding alert controls',()=>{const html=renderToStaticMarkup(<FollowControls identityId="public-id" initialFollow={{following:true,alertsEnabled:true}} canFollow={true} returnTo="/following" suspended/>);expect(html).toContain('إلغاء المتابعة');expect(html).toContain('الملف غير متاح');expect(html).not.toContain('كتم تنبيهات النشر');expect(html).not.toContain('تفعيل تنبيهات النشر');});
