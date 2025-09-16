import { Component, ElementRef, ViewChild } from '@angular/core';
import { LoadingController, ToastController, AlertController } from '@ionic/angular';
import { Router } from '@angular/router';
import { ApiService } from 'src/app/services/api.service';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
//import * as pdfjsLib from 'pdfjs-dist';
//pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
import * as pdfjsLib from 'pdfjs-dist/build/pdf';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.entry';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

@Component({
  selector: 'app-upload',
  templateUrl: './upload.page.html',
  styleUrls: ['./upload.page.scss'],
  standalone: false,
})
export class UploadPage {
  @ViewChild('fileInput', { static: false }) fileInput!: ElementRef;
  selectedFile!: File;

  constructor(
    private router: Router, 
    private apiService: ApiService, 
    private loadingController: LoadingController,
    private toastController: ToastController,
    private alertController: AlertController
  ) {}

  private isUserLoggedIn(): boolean {
    return !!localStorage.getItem('token');
  }

  private getQuickAccessCount(): number {
    const count = localStorage.getItem('quickAccessCount');
    return count ? parseInt(count, 10) : 0;
  }

  private incrementQuickAccessCount(): void {
    const currentCount = this.getQuickAccessCount();
    localStorage.setItem('quickAccessCount', (currentCount + 1).toString());
  }

  private async checkQuickAccessLimit(): Promise<boolean> {
    if (this.isUserLoggedIn()) {
      return true; // Usuário logado pode usar sem limite
    }

    const count = this.getQuickAccessCount();
    if (count >= 2) {
      const alert = await this.alertController.create({
        header: 'Limite Atingido',
        message: 'Você já validou 2 boletos com o acesso rápido. Para continuar validando boletos, faça login na sua conta.',
        buttons: [
          {
            text: 'Cancelar',
            role: 'cancel'
          },
          {
            text: 'Fazer Login',
            handler: () => {
              this.router.navigate(['/login']);
            }
          }
        ]
      });
      await alert.present();
      return false;
    }
    return true;
  }

 async presentLoading(message: string = 'Processando boleto...'): Promise<HTMLIonLoadingElement> {
    const loading = await this.loadingController.create({
      message,
      spinner: 'circles', 
      backdropDismiss: false, 
    });
    await loading.present();
    return loading;
  }

  async showToast(message: string, color: string = 'medium') {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      position: 'bottom',
      color
    });
    await toast.present();
  }

  async usarCamera() {
    const canProceed = await this.checkQuickAccessLimit();
    if (!canProceed) return;

    let loading: HTMLIonLoadingElement | undefined;
    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
      });
  
      console.log('Imagem capturada:', image.dataUrl);
  
      if (!image.dataUrl) {
        throw new Error('Imagem inválida: dataUrl não disponível.');
      }
      
      const blob = this.dataURLToBlob(image.dataUrl);
      
      const file = new File([blob], 'foto-camera.png', { type: blob.type });

      loading = await this.presentLoading('Enviando imagem...');  
  
      this.apiService.uploadBoleto(file, '').subscribe({
        next: (res) => {
          loading?.dismiss();
          if (!this.isUserLoggedIn()) {
            this.incrementQuickAccessCount();
          }
          console.log('Resposta do backend:', res);
          this.router.navigate(['/result'], { state: { resultado: res } });
        },
        error: (err) => {
          loading?.dismiss();
          const errorMessage = err.userMessage || err.error?.error || 'Erro desconhecido';
          this.showToast(errorMessage, 'danger');
        },
      });
  
    } catch (error) {
      loading?.dismiss();
      console.error('Erro ao capturar imagem:', error);
      
      const errorMessage = (error as any)?.message || '';
      if (errorMessage.includes('User cancelled photos app')) {
        this.showToast('Operação cancelada pelo usuário', 'warning');
      } else {
        this.showToast('Erro ao capturar imagem. Tente novamente.', 'danger');
      }
    }
  }
  
  abrirGaleria() {
    this.fileInput.nativeElement.click();
  }

  async arquivoSelecionado(event: any) {
    const canProceed = await this.checkQuickAccessLimit();
    if (!canProceed) return;

    const file = event.target.files[0];
    if (!file) return;

    this.selectedFile = file;

    if (file.type === 'application/pdf') {
      const arrayBuffer = await file.arrayBuffer();

      try {
        await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        this.enviarArquivo(file, '');
      } catch (err: any) {
        if (err?.name === 'PasswordException') {
          const senha = prompt('Este PDF está protegido. Digite a senha do boleto:') || '';
          this.enviarArquivo(file, senha);
        } else {
          alert('Erro ao processar o PDF: ' + err.message);
        }
      }

  } else {
    this.enviarArquivo(file, '');
  }

  }

  async enviarArquivo(file: File, senha: string) {
    const loading = await this.presentLoading();
    this.apiService.uploadBoleto(file, senha).subscribe({
      next: (res) => {
        loading.dismiss();
        if (!this.isUserLoggedIn()) {
          this.incrementQuickAccessCount();
        }
        console.log('Resposta do backend:', res);
        this.router.navigate(['/result'], { state: { resultado: res } });
      },
      error: (err) => {
        loading.dismiss();
        const errorMessage = err.userMessage || err.error?.error || 'Erro desconhecido';
        this.showToast(errorMessage, 'danger');
      },
    });
  }



  dataURLToBlob(dataUrl: string): Blob {
    const arr = dataUrl.split(',');
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch) {
      throw new Error('Tipo MIME inválido na dataURL.');
    }
    const mime = mimeMatch[1];
  
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  }
  
  
}
