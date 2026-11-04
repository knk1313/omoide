"""Mac のアプリ（omoide.app）として動くときの、Dock とメニューの受け口。

.app はターミナルを出さずに動くので、終わる操作（Dock のメニューの「終了」や Cmd+Q）を、
macOS のアプリの決まりどおりに受ける必要がある。そのため、メインのスレッドで NSApplication を動かし、
「始める」画面のサーバーは別のスレッドで動かす。

- Dock のアイコンを押すと、「始める」画面をブラウザーで開き直す
- 「omoideを終了」（Cmd+Q）や Dock の「終了」で、共有を止めてから終わる
- 画面の「omoideを終了する」でサーバーが止まったら、アプリも終わる
"""

import threading
import webbrowser
from collections.abc import Callable
from functools import cache


@cache
def _delegate_class():
    # PyObjC のクラスは、1 つのプロセスで 1 回だけ定義できる
    from AppKit import NSObject, NSTerminateNow

    # url・server_thread・request_quit は、作った後に run() で持たせる
    class OmoideDelegate(NSObject):
        def applicationShouldHandleReopen_hasVisibleWindows_(self, app, has_windows):
            webbrowser.open(self.url)
            return True

        def applicationShouldTerminate_(self, app):
            # 共有を止め、サーバーが終わるのを待ってから終わる
            self.request_quit()
            self.server_thread.join(timeout=15)
            return NSTerminateNow

        def openBrowser_(self, sender):
            webbrowser.open(self.url)

    return OmoideDelegate


def _menu(delegate):
    from AppKit import NSMenu, NSMenuItem

    menubar = NSMenu.alloc().init()
    app_item = NSMenuItem.alloc().init()
    menubar.addItem_(app_item)
    app_menu = NSMenu.alloc().init()
    reopen = NSMenuItem.alloc().initWithTitle_action_keyEquivalent_("「始める」画面を開く", "openBrowser:", "o")
    reopen.setTarget_(delegate)
    app_menu.addItem_(reopen)
    app_menu.addItem_(NSMenuItem.separatorItem())
    app_menu.addItem_(NSMenuItem.alloc().initWithTitle_action_keyEquivalent_("omoideを終了", "terminate:", "q"))
    app_item.setSubmenu_(app_menu)
    return menubar


def run(url: str, server_thread: threading.Thread, request_quit: Callable[[], None]) -> None:
    """NSApplication を動かす。サーバーのスレッドが終わるか、利用者が終了を選ぶと戻らずに終わる。"""
    from AppKit import NSApplication, NSApplicationActivationPolicyRegular
    from PyObjCTools import AppHelper

    app = NSApplication.sharedApplication()
    app.setActivationPolicy_(NSApplicationActivationPolicyRegular)
    delegate = _delegate_class().alloc().init()
    delegate.url = url
    delegate.server_thread = server_thread
    delegate.request_quit = request_quit
    app.setDelegate_(delegate)
    app.setMainMenu_(_menu(delegate))

    def watch() -> None:
        # 画面の「omoideを終了する」でサーバーが止まったら、アプリも終える
        server_thread.join()
        AppHelper.callAfter(app.terminate_, None)

    threading.Thread(target=watch, name="omoide-watch", daemon=True).start()
    AppHelper.runEventLoop()


def alert(title: str, message: str) -> None:
    """起動できなかった理由を、ダイアログで知らせる（.app にはターミナルの窓がないため）。"""
    from AppKit import NSAlert, NSApplication

    NSApplication.sharedApplication()
    dialog = NSAlert.alloc().init()
    dialog.setMessageText_(title)
    dialog.setInformativeText_(message)
    dialog.runModal()
