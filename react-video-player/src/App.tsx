import './App.css'
import VideoPlayer from './components/VideoPlayer/VideoPlayer'

function App() {
  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-5xl">
        <h1 className="text-white text-2xl md:text-3xl font-semibold mb-6 text-center">
          WebGL Video Player
        </h1>
        <VideoPlayer 
          src="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
          poster="https://images.pexels.com/photos/5387784/pexels-photo-5387784.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2"
          watermarkUrl="https://raw.githubusercontent.com/remojansen/logo.ts/051b964f2034d243f6e57024350b7e06f5e151ea/ts.png"
        />
      </div>
    </div>
  );
}

export default App
