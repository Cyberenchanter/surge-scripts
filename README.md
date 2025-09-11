# Scripts

Some utility scripts for the Surge network tool.

# Surge for iOS Tutorial

1.  Enable the switches for `HTTP Rewrite`, `MITM`, and `Scripting`.

2.  To configure the MITM certificate, tap on **Configure CA** under the MITM section.
    * If your proxy provider offers a Surge managed service, you will most likely see a pre-generated certificate.
    * If you do not see one, click the button to generate a new certificate.

3.  Tap **Install CA Certificate to System** and follow the prompts provided by Surge. (This will involve downloading and installing a configuration profile. Afterwards, you will need to go to your iOS **Settings > General > About > Certificate Trust Settings** and enable full trust for the newly installed certificate).

4.  
    * If the configuration profile you just installed already included a pre-generated certificate, you can simply tap **Cancel** in the top-left corner to return to the main Surge screen after installation is complete (your certificate is already configured).
    * If you generated the certificate yourself just now, please tap **Done** in the top-right corner to save it.

5.  To enable modules, tap the **Modules** button under the Module section.
    * Tap the **Install Modules** button.
    * Paste the GitHub raw link for the `.sgmodule` file, which is typically named after the software you intend to modify.
    * After confirming the installation, ensure there is a checkmark to the left of the newly installed module, which indicates it is enabled.
    * Tap **Done** in the top-right corner to confirm.



# 使用教程（Surge for iOS）
* 开启http rewrite, mitm, scripting的开关
* 配置mitm证书
  * 点击mitm下方的configure CA
  * 如果你的机场提供了surge托管服务，那么很大概率你将会看到一个已经生成好的证书，如果你没有看到，请点击按钮生成一个新的证书
  * 点击install CA certificate to System，遵循surge提示操作（你会下载并安装一个配置文件，随后在iOS系统设置的关于界面最下方选择信任刚刚安装的证书）
  * 如果你刚刚的配置文件已经附带了生成好的证书，那么在你完成安装后回到surge界面点击左上角的cancel即可（你的证书已经配置好了），如果你是刚刚自己生成的证书，请点击右上角done保存
* 开启模块
  * 点击module下方的modules按钮，点击install modules按钮，粘贴以你需要白嫖的软件名字命名的.sgmodule文件的github raw链接，确认安装后确保刚刚安装的模块左侧有对勾代表模块已经启用，点击右上角done确认即可
