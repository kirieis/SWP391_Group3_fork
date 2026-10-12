import java.util.ArrayList;
import java.util.EmptyStackException;
import java.util.List;

public class ArrayStack<E> {
    private final List<E> data = new ArrayList<>();

    public void push(E e) {
        data.add(e);
    }

    public E pop() {
        if (data.isEmpty()) {
            throw new EmptyStackException();
        }
        return data.remove(data.size() - 1);
    }

    public E peek() {
        if (data.isEmpty()) {
            throw new EmptyStackException();
        }
        return data.get(data.size() - 1);
    }

    public boolean isEmpty() {
        return data.isEmpty();
    }

    public int size() {
        return data.size();
    }

    public void reverse() {
        java.util.Collections.reverse(data);
    }

    public static void main(String[] args) {
        ArrayStack<Integer> s = new ArrayStack<>();
        for (int i = 1; i <= 5; i++) {
            s.push(i * i);
        }
        s.reverse();
        System.out.println("size = " + s.size());
        while (!s.isEmpty()) {
            System.out.println(s.pop());
        }
    }
}
